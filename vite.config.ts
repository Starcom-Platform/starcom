import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import path from 'path';
import fs from 'fs';

/**
 * The build's identity, read from the file the build already writes.
 *
 * scripts/publish-health.mjs runs before vite in every build chain and writes
 * public/.well-known/starcom-health.json with the commit and a timestamp. This
 * reads that rather than shelling out to git again, so the number the app
 * reports and the number the well-known endpoint serves cannot disagree — two
 * independent derivations of "which build is this" is how they drift.
 *
 * Absent in a bare `vite dev` that has never had a build run. Absence is
 * reported as null rather than papered over with a guess: a capture that
 * cannot say which build drew it should say that, not invent one.
 */
function readBuildIdentity(): { sha: string | null; builtAt: string | null; treeDirty: boolean | null } {
  try {
    const raw = fs.readFileSync(
      path.resolve(__dirname, 'public/.well-known/starcom-health.json'), 'utf8',
    );
    const health = JSON.parse(raw);
    return {
      sha: typeof health.buildSha === 'string' ? health.buildSha : null,
      builtAt: typeof health.builtAt === 'string' ? health.builtAt : null,
      // Unknown stays unknown: a missing field is not the same as a clean tree.
      treeDirty: typeof health.buildTreeDirty === 'boolean' ? health.buildTreeDirty : null,
    };
  } catch {
    return { sha: null, builtAt: null, treeDirty: null };
  }
}

// Define directories to exclude from Vite processing
const EXCLUDED_DIRS = [
  'backup',
  'starcom-mk2-backup',
  'backup_logs',
  'ai-security-relaynode'
];

// The in-browser IPFS node's code, loaded on the first upload (security audit, SA3).
const IPFS_STACK = /node_modules\/(helia|@helia|libp2p|@libp2p|@chainsafe|@ipshipyard|@multiformats|multiformats|ipfs-)/;

type ModuleInfoOf = (id: string) => { importers: readonly string[]; dynamicImporters: readonly string[] } | null;

/**
 * Whether only the IPFS stack reaches a module, directly or through other noble modules. libp2p brings its
 * own copies of the noble curves and ciphers; sent to the eager crypto chunk with the rest, they put 50 KB
 * of upload-only code in every first visit. Asked of Rollup, not read from paths, which hoisting reshuffles.
 */
function onlyTheIpfsStackReaches(id: string, moduleInfo: ModuleInfoOf, seen = new Set<string>()): boolean {
  if (seen.has(id)) return true;
  seen.add(id);
  const info = moduleInfo(id);
  const importers = [...(info?.importers ?? []), ...(info?.dynamicImporters ?? [])];
  if (!importers.length) return false;
  return importers.every((by) => IPFS_STACK.test(by)
    || (by.includes('node_modules/@noble') && onlyTheIpfsStackReaches(by, moduleInfo, seen)));
}

export default defineConfig(({ mode }) => {
  const buildIdentity = readBuildIdentity();
  // Environment-specific configuration
  const isProduction = mode === 'production';
  const isDevelopment = mode === 'development';
  const target = process.env.VITE_TARGET || '';
  const isIPFS = target === 'ipfs';
  
  return {
  // Use relative base for IPFS builds so assets resolve under /ipfs/<CID>/
  base: isIPFS ? './' : '/',
  define: {
    global: 'globalThis',
    'process.env': {},
    'import.meta.env.VITE_TARGET': JSON.stringify(target),
    // Environment variables for feature flag defaults
    __STARCOM_PROD__: isProduction,
    __STARCOM_DEV__: isDevelopment,
    // Disable verbose logging in production by default
    __VERBOSE_LOGGING_DEFAULT__: !isProduction,
    __ASSET_DEBUG_DEFAULT__: isDevelopment,
    __DEPLOYMENT_DEBUG_DEFAULT__: isDevelopment,
    // Which build this is. Null when no build has been run; see readBuildIdentity.
    __BUILD_SHA__: JSON.stringify(buildIdentity.sha),
    __BUILT_AT__: JSON.stringify(buildIdentity.builtAt),
    __BUILD_TREE_DIRTY__: JSON.stringify(buildIdentity.treeDirty),
  },
  plugins: [
    react(), 
    tsconfigPaths(),
    nodePolyfills({
      // Enhanced polyfills for browser compatibility including IPFS. No 'crypto': only mlkem's fallback for a
      // browser without globalThis.crypto reached it, and it carried elliptic and pbkdf2 (security audit, SA4).
      include: [
        'buffer',
        'process',
        'stream',
        'util',
        'http',
        'https', 
        'zlib',
        'path',
        'vm',
        'fs',
        'url',
        'querystring',
        'events'
      ],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
    // Custom plugin to exclude backup directories from Vite's scanning
    {
      name: 'exclude-backup-files',
      configureServer(server) {
        // Hook into Vite's HTML transform to skip backup files
        return () => {
          server.middlewares.use((req, res, next) => {
            const url = req.url || '';
            
            // Handle Google Analytics API endpoint
            if (url === '/api/analytics/realtime' && req.method === 'GET') {
              res.setHeader('Content-Type', 'application/json');
              res.setHeader('Access-Control-Allow-Origin', '*');
              
              // For now, return a note about server-side implementation needed
              res.statusCode = 501;
              res.end(JSON.stringify({
                error: 'Google Analytics API requires server-side implementation',
                message: 'Real GA4 data fetching needs backend with proper JWT signing and OAuth flow',
                note: 'Service account credentials are available but need secure server-side handling'
              }));
              return;
            }
            
            if (EXCLUDED_DIRS.some(dir => url.includes(`/${dir}/`))) {
              res.statusCode = 404;
              res.end('Not found');
              return;
            }
            next();
          });
        };
      },
    },
  ],

  css: {
    postcss: './postcss.config.cjs',
    devSourcemap: false, // Disable CSS source maps in development
  },
  optimizeDeps: {
    include: [
      'buffer',
      'stream-browserify',
      'path-browserify',
      'vm-browserify',
      'uuid',
      'crypto-js',
      'nostr-tools',
      'axios',
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
      'framer-motion',
      'three',
      'zustand',
      'zod',
      'd3',
      'styled-components',
      'react-leaflet',
      'leaflet'
    ],
    exclude: [
      'wasm_mini_server',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process'
    ],
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: 'globalThis',
      },
      // Enable JSX in TS files
      jsx: 'automatic',
      // Target latest browsers for better compatibility
      target: 'es2020',
    },
  },
  server: {
    port: 5174,
    host: '0.0.0.0', // Allow external connections
    // Enhanced HMR configuration for WebSocket stability
    hmr: {
      port: 5175, // Use different port for HMR WebSocket
      host: 'localhost',
      timeout: 15000, // 15 seconds for large project
      overlay: true,
    },
    // Enable CORS for development
    cors: true,
    // Watch options for better file monitoring
    watch: {
      usePolling: false,
      interval: 100,
      ignored: ['**/node_modules/**', '**/backup/**', '**/starcom-mk2-backup/**', '**/backup_logs/**'],
    },
    fs: {
      // Explicitly allow these directories
      allow: ['.', './src', './public', './asset development'],
      // Strict allow mode to prevent scanning of unwanted directories
      strict: false // Changed to false to allow more flexibility
    },
  },
  build: {
    assetsInlineLimit: 0, // Ensure all assets are properly externalized
    rollupOptions: {
      // Explicitly set the input file to avoid scanning backup directories
      input: path.resolve(__dirname, 'index.html'),
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        // Vendor splitting for better caching and smaller initial load
        manualChunks(id: string, { getModuleInfo }) {
          // Three.js and 3D rendering (large)
          if (id.includes('node_modules/three')) {
            return 'vendor-three';
          }
          // Shared crypto primitives and runtime helpers, imported by the eager graph
          // (nostr, the Buffer shim). Named, so the entry depends on a small shared
          // chunk. Rollup once folded them into vendor-solana, putting 2.3MB of wallet
          // code in every first visit; the wallet is retired (plan item 4.4).
          if (
            id.includes('vite/preload-helper') ||
            (id.includes('node_modules/@noble') && !onlyTheIpfsStackReaches(id, getModuleInfo)) ||
            id.includes('node_modules/buffer/') ||
            id.includes('node_modules/base-x')
          ) {
            return 'vendor-crypto-primitives';
          }
          // Nostr ecosystem
          if (id.includes('node_modules/nostr-tools') || id.includes('node_modules/@nostr')) {
            return 'vendor-nostr';
          }
          // D3 visualization
          if (id.includes('node_modules/d3')) {
            return 'vendor-d3';
          }
          // React core (shared across all chunks - good cache hit)
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          // Framer motion
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-framer';
          }
          // Crypto libraries (NOTE: crypto-browserify deliberately excluded — it's a Node
          // `crypto` polyfill once pulled in by @solana/* packages via dynamic require(), and
          // Rollup's CommonJS interop breaks when a package's dynamic-require target lands
          // in a different chunk than the caller. Splitting it into its own vendor chunk
          // away from vendor-solana caused a hard crash on every page load in the production
          // build: "Cannot read properties of undefined (reading 'exports')" inside
          // vendor-solana's code calling into vendor-crypto's requireCryptoBrowserify.
          // Leaving it unmatched here lets Rollup bundle it naturally alongside its callers.
          if (id.includes('node_modules/crypto-js') || id.includes('node_modules/ethers')) {
            return 'vendor-crypto';
          }
          // Mapping / Cesium / Leaflet
          if (id.includes('node_modules/leaflet') || id.includes('node_modules/react-leaflet') || id.includes('node_modules/cesium')) {
            return 'vendor-maps';
          }
          // TanStack Query
          if (id.includes('node_modules/@tanstack')) {
            return 'vendor-tanstack';
          }
        }
      }
    }
  },
  resolve: {
    alias: {
      // Source code aliases for reliable path resolution
      '@': path.resolve(__dirname, './src'),
      // ONNX Runtime's WebAssembly, which its package does not export by path: Starcom's own translator serves it
      // from Starcom, as the page's policy requires (D-ML, T2). Installed with the dependency, never committed.
      '@ort-dist': path.resolve(__dirname, './node_modules/onnxruntime-web/dist'),
      '@assets': path.resolve(__dirname, './src/assets'),
      '@models': path.resolve(__dirname, './src/models'),
      '@components': path.resolve(__dirname, './src/components'),
      '@services': path.resolve(__dirname, './src/services'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@utils': path.resolve(__dirname, './src/utils'),
  // NetRunner engine alias (to avoid deep fragile relative paths on some build environments)
  '@netrunner-engine': path.resolve(__dirname, './src/applications/netrunner/scripts/engine'),
  '@netrunnerEngine': path.resolve(__dirname, './src/netrunnerEngine.ts'),
      // Polyfill Node.js modules for browser compatibility
      stream: 'stream-browserify',
      util: 'util',
      path: 'path-browserify',
      vm: 'vm-browserify',
    },
  },
  };
});