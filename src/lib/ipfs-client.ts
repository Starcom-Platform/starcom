// Types only: the stack itself (helia, libp2p, WebRTC and their certificate libraries, about 920 KB minified) is
// imported on the first call, so a first visit no longer carries it (security audit, SA3).
import type { Helia } from 'helia'
import type { UnixFS } from '@helia/unixfs'
import type { CID } from 'multiformats/cid'
import { env } from '../config/env'

// IPFS client singleton
let heliaClient: Helia | null = null
let unixfsClient: UnixFS | null = null

// Initialize Helia (modern IPFS) in the browser
export async function getIPFSClient() {
  if (!heliaClient) {
    try {
      const [{ createHelia }, { unixfs }] = await Promise.all([import('helia'), import('@helia/unixfs')])
      // createHelia() has no built-in timeout: its default libp2p stack dials a
      // list of public bootstrap peers, and in a restrictive/sandboxed network
      // those dials can hang far longer than they fail, with no rejection ever
      // reaching this try/catch. Race it against a hard deadline so a slow
      // network degrades to the gateway fallback below instead of blocking
      // every caller of getIPFSClient() indefinitely.
      // helia 7 returns the node unstarted (helia 5 started it): start() is what dials and serves.
      heliaClient = await Promise.race([
        createHelia().start(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Helia node creation timed out')), 6000)
        )
      ])
      unixfsClient = unixfs(heliaClient)

      console.log('IPFS/Helia node initialized successfully')
    } catch (error) {
      console.warn('Failed to create local IPFS node, using gateway fallback:', error)
      
      // Fallback to gateway-only implementation
      return {
        add: async (content: File | Blob | string | Uint8Array) => {
          try {
            // Try Web3.Storage free API (requires token)
            const token = env.web3StorageToken
            if (token) {
              const formData = new FormData()
              const blob = new Blob([content], { type: 'application/octet-stream' })
              formData.append('file', blob)
              
              const response = await fetch('https://api.web3.storage/upload', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`
                },
                body: formData
              })
              
              if (response.ok) {
                const data = await response.json()
                return { cid: { toString: () => data.cid } }
              }
            }
            
            /**
             * No fallback. This used to hash the content locally, prefix "Qm"
             * to the hex digest, and RETURN IT AS A CID — announcing a
             * successful upload of something that had never left the machine.
             *
             * It was not even a well-formed CID. A real CIDv0 is base58 of a
             * multihash, not hex, so the value could never resolve on any
             * gateway. A caller storing it held an identifier for content that
             * did not exist anywhere, and only a console.warn distinguished
             * that from a real pin.
             *
             * This is the defect class the EIN cross-review found in three
             * separate nodes: an integration reporting success without
             * evidence of success. Ratified practice is to make the failure
             * loud rather than a silent, wrong success — so it throws.
             *
             * Retrieval is unaffected and still works through the gateway
             * chain; it is only the claim "this is now on IPFS" that requires
             * an actual pin.
             */
            throw new Error(
              'IPFS upload unavailable: no local node and no pinning credentials. '
              + 'Refusing to return a fabricated CID for content that was never uploaded.'
            )
          } catch (error) {
            console.error('Failed to upload to IPFS:', error)
            throw error
          }
        },
        cat: async (cid: string) => {
          // Try multiple public gateways
          const gateways = [
            `https://dweb.link/ipfs/${cid}`,
            `https://cloudflare-ipfs.com/ipfs/${cid}`,
            `https://ipfs.io/ipfs/${cid}`,
            `https://gateway.pinata.cloud/ipfs/${cid}`
          ]
          
          for (const gateway of gateways) {
            try {
              const response = await fetch(gateway)
              if (response.ok) {
                return response.arrayBuffer()
              }
            } catch (error) {
              console.warn(`Gateway ${gateway} failed:`, error)
            }
          }
          
          throw new Error(`Failed to retrieve ${cid} from all gateways`)
        }
      }
    }
  }
  
  return {
    add: async (content: File | Blob | string | Uint8Array) => {
      let data: Uint8Array
      if (typeof content === 'string') {
        data = new TextEncoder().encode(content)
      } else if (content instanceof File) {
        data = new Uint8Array(await content.arrayBuffer())
      } else if (content instanceof Blob) {
        data = new Uint8Array(await content.arrayBuffer())
      } else {
        data = new TextEncoder().encode(JSON.stringify(content))
      }
      
      const cid = await unixfsClient.addBytes(data)
      return { cid }
    },
    cat: async (cid: string | CID) => {
      const cidObj = typeof cid === 'string' ? (await import('multiformats/cid')).CID.parse(cid) : cid
      const chunks = []
      
      for await (const chunk of unixfsClient.cat(cidObj)) {
        chunks.push(chunk)
      }
      
      return new Blob(chunks).arrayBuffer()
    }
  }
}

// Upload file to IPFS
export async function uploadToIPFS(file: File | Blob | string): Promise<string> {
  const ipfs = await getIPFSClient()
  
  try {
    const result = await ipfs.add(file)
    const cid = result.cid.toString()
    console.log('Uploaded to IPFS:', cid)
    return cid
  } catch (error) {
    console.error('IPFS upload failed:', error)
    throw error
  }
}

// Retrieve file from IPFS
export async function getFromIPFS(cid: string): Promise<ArrayBuffer> {
  const ipfs = await getIPFSClient()
  return ipfs.cat(cid)
}

// Get public gateway URL (for displaying files)
export function getIPFSGatewayUrl(cid: string): string {
  // Use multiple gateways for redundancy
  const gateways = [
    `https://dweb.link/ipfs/${cid}`,
    `https://cloudflare-ipfs.com/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`
  ]
  return gateways[0] // Could implement gateway selection logic
}

// AI-NOTE: Helia is the modern IPFS implementation
// Falls back to public gateways if local node fails
// Content is addressed by hash, making it tamper-evident
