/**
 * Mock response fixtures for OSINT adapters.
 * Used by unit and integration tests.
 */

// ---------------------------------------------------------------------------
// Shodan
// ---------------------------------------------------------------------------

export const shodanSearchResponse = {
  matches: [
    {
      ip_str: '93.184.216.34',
      port: 443,
      product: 'nginx',
      version: '1.21.6',
      os: 'Linux',
      org: 'Edgecast',
      isp: 'Edgecast Inc.',
      hostnames: ['example.com'],
      domains: ['example.com'],
      vulns: ['CVE-2021-23017'],
      location: { country_code: 'US', city: 'Norwell', latitude: 42.1596, longitude: -70.8217 },
      timestamp: '2025-07-01T12:00:00.000Z'
    }
  ],
  total: 1
};

export const shodanHostResponse = {
  ip_str: '93.184.216.34',
  ports: [80, 443, 8080],
  os: 'Linux',
  org: 'Edgecast',
  hostnames: ['example.com'],
  vulns: ['CVE-2021-23017'],
  data: [
    { port: 80, transport: 'tcp', product: 'nginx' },
    { port: 443, transport: 'tcp', product: 'nginx' }
  ]
};

export const shodanApiInfoResponse = {
  query_credits: 100,
  scan_credits: 50,
  plan: 'dev',
  https: true,
  unlocked: true
};

// ---------------------------------------------------------------------------
// Censys
// ---------------------------------------------------------------------------

export const censysSearchHostsResponse = {
  result: {
    hits: [
      {
        ip: '93.184.216.34',
        services: [
          { port: 80, service_name: 'HTTP', transport_protocol: 'TCP' },
          { port: 443, service_name: 'HTTPS', transport_protocol: 'TCP' }
        ],
        location: { country: 'United States', city: 'Norwell' },
        autonomous_system: { asn: 15133, description: 'Edgecast', name: 'Edgecast' }
      }
    ],
    total: 1
  }
};

export const censysViewHostResponse = {
  result: {
    ip: '93.184.216.34',
    services: [
      { port: 80, service_name: 'HTTP', transport_protocol: 'TCP' },
      { port: 443, service_name: 'HTTPS', transport_protocol: 'TCP' }
    ],
    location: { country: 'United States', city: 'Norwell' },
    autonomous_system: { asn: 15133, description: 'Edgecast' },
    last_updated_at: '2025-07-01T12:00:00Z'
  }
};

// ---------------------------------------------------------------------------
// VirusTotal
// ---------------------------------------------------------------------------

export const vtFileReportResponse = {
  data: {
    id: '44d88612fea8a8f36de82e1278abb02f',
    type: 'file',
    attributes: {
      last_analysis_stats: { malicious: 0, suspicious: 0, undetected: 60, harmless: 0, timeout: 0 },
      last_analysis_date: 1720000000,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      meaningful_name: 'test.exe',
      type_description: 'Win32 EXE'
    }
  }
};

export const vtDomainReportResponse = {
  data: {
    id: 'example.com',
    type: 'domain',
    attributes: {
      last_analysis_stats: { malicious: 0, suspicious: 0, undetected: 70, harmless: 5, timeout: 0 },
      registrar: 'RESERVED-Internet Assigned Numbers Authority',
      creation_date: 946684800,
      whois: 'Domain Name: EXAMPLE.COM'
    }
  }
};

export const vtIpReportResponse = {
  data: {
    id: '93.184.216.34',
    type: 'ip_address',
    attributes: {
      last_analysis_stats: { malicious: 0, suspicious: 0, undetected: 65, harmless: 3, timeout: 0 },
      country: 'US',
      as_owner: 'Edgecast',
      network: '93.184.216.0/24'
    }
  }
};

// ---------------------------------------------------------------------------
// TheHarvester (mock-only adapter)
// ---------------------------------------------------------------------------

export const theHarvesterEmailsResponse = {
  emails: ['admin@example.com', 'info@example.com', 'support@example.com'],
  _isEnhancedMock: true
};

export const theHarvesterSubdomainsResponse = {
  subdomains: ['mail.example.com', 'www.example.com', 'api.example.com'],
  _isEnhancedMock: true
};

// ---------------------------------------------------------------------------
// IntelAnalyzer (mock-only adapter)
// ---------------------------------------------------------------------------

export const intelAnalyzerResponse = {
  type: 'analysis',
  summary: 'Target domain analysis complete',
  findings: [
    { category: 'infrastructure', description: 'Hosted on Edgecast CDN', confidence: 0.9 }
  ],
  _isEnhancedMock: true
};
