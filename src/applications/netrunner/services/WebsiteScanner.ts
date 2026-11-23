/**
 * NetRunner Website Scanner Service
 * 
 * Production-ready website analysis service for Vite React TypeScript dApp
 * Optimized for Vercel deployment with enhanced security and performance.
 * 
 * @author GitHub Copilot
 * @date July 12, 2025
 */

// Intel integration imports
import { storageOrchestrator } from '../../../core/intel/storage/storageOrchestrator';
import { Intel } from '../../../models/Intel/Intel';
import { isNetRunnerIntelEnabled, logIntelFlagContext } from '../../../config/netrunnerIntelFeatureFlag';

export interface ScanResult {
  url: string;
  title: string;
  status: 'scanning' | 'completed' | 'error';
  progress: number;
  sourceCode: string;
  vulnerabilities: Vulnerability[];
  osintData: OSINTData;
  metadata: WebsiteMetadata;
  timestamp: number;
}

import { siteFetcher, type FetchRoute } from '../../../extension/siteFetcher';

export interface Vulnerability {
  id: string;
  title: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  location: string;
  impact: string;
  recommendation: string;
  cve?: string;
  score?: number;
}

export interface OSINTData {
  emails: string[];
  socialMedia: string[];
  technologies: Technology[];
  serverInfo: string[];
  subdomains: string[];
  certificates: CertificateInfo[];
  dns: DNSRecord[];
}

export interface Technology {
  name: string;
  version?: string;
  category: 'framework' | 'library' | 'cms' | 'analytics' | 'cdn' | 'security';
  confidence: number;
}

export interface CertificateInfo {
  issuer: string;
  subject: string;
  validFrom: string;
  validTo: string;
  algorithm: string;
}

export interface DNSRecord {
  type: string;
  value: string;
  ttl?: number;
}

export interface WebsiteMetadata {
  ip: string;
  server: string;
  lastModified: string;
  size: string;
  responseTime: number;
  headers: Record<string, string>;
  statusCode: number;
  redirects: string[];
  contentType: string;
  encoding: string;
  /** Which read the page came through: the desktop app or Starcom Uplink (EX32). */
  fetchedVia?: FetchRoute;
}

/**
 * Where a scan is: a step of the whole (plan item 8.3b). It reported 10, 25, 40,
 * 60, 80, 90 percent, weights nobody measured: the fetch is nearly all of a scan
 * and the rest takes no time, so a bar sat at 10% and then ran to the end.
 */
export interface ScanStep {
  step: number;
  of: number;
  label: string;
}

/**
 * What a browser is told when it asks for a page scan with no way to read the
 * page (plan item 7, block C; decision B9; D-EX EX32). A browser tab cannot
 * read another site's pages. It tried three public CORS proxies: on 2026-10-01
 * two hung past 15 s and the third redirected to a demo, and each was told
 * what was being investigated. Starcom Uplink or the desktop app can read it.
 */
export const PAGE_SCAN_NEEDS_DESKTOP =
  "Page scans need Starcom Uplink or the Starcom desktop app: a browser tab cannot read another site's pages. Recon, in the Scanner tab, works here.";

export class WebsiteScannerService {
  /**
   * Performs a comprehensive website scan
   */
  async scanWebsite(
    url: string, 
    onStep?: (step: ScanStep) => void,
    options: { storeIntel?: boolean } = {}
  ): Promise<ScanResult> {
    const startTime = Date.now();
    const normalizedUrl = this.normalizeUrl(url);
    const { storeIntel = true } = options;
    const storing = storeIntel && isNetRunnerIntelEnabled();
    const of = storing ? 6 : 5;
    let step = 0;
    const next = (label: string) => onStep?.({ step: ++step, of, label });

    const result: ScanResult = {
      url: normalizedUrl,
      title: 'Scanning...',
      status: 'scanning',
      progress: 0,
      sourceCode: '',
      vulnerabilities: [],
      osintData: {
        emails: [],
        socialMedia: [],
        technologies: [],
        serverInfo: [],
        subdomains: [],
        certificates: [],
        dns: []
      },
      metadata: {
        ip: '',
        server: '',
        lastModified: '',
        size: '',
        responseTime: 0,
        headers: {},
        statusCode: 0,
        redirects: [],
        contentType: '',
        encoding: ''
      },
      timestamp: startTime
    };

    try {
      // Step 1: Fetch website content
      next('Fetching the page');
      const { html, metadata, realHeaders } = await this.fetchWithFallback(normalizedUrl);
      result.sourceCode = html;
      result.metadata = { ...result.metadata, ...metadata };

      // Step 2: Parse HTML
      next('Reading its HTML');
      const doc = new DOMParser().parseFromString(html, 'text/html');
      result.title = doc.querySelector('title')?.textContent || 'No title found';

      // Step 3: Security analysis
      next('Checking for weaknesses');
      result.vulnerabilities = await this.analyzeVulnerabilities(html, doc, normalizedUrl, realHeaders);

      // Step 4: OSINT extraction
      next('Extracting public details');
      result.osintData = this.extractOSINTData(html, doc, normalizedUrl);

      // Step 5: Technology detection
      next('Identifying technologies');
      result.osintData.technologies = this.detectTechnologies(html, doc);

      // Step 6: Store Intel data if requested (guarded by feature flag so merge is safe when disabled)
      if (storing) {
        try {
          next('Storing what was found');
          logIntelFlagContext('WebsiteScannerService.scanWebsite: transforming + storing Intel objects');
          const intelObjects = this.transformToIntel(result);
          if (intelObjects.length > 0) {
            const storageResult = await storageOrchestrator.batchStoreIntel(intelObjects);
            if (storageResult.success) {
              console.log(`✅ Stored ${intelObjects.length} Intel objects from scan`);
            } else {
              console.error('❌ Failed to store Intel objects:', storageResult.error);
            }
          }
        } catch (storageError) {
          console.error('❌ Error during Intel storage (feature flag path):', storageError);
          // Continue scan; feature is experimental.
        }
      } else {
        // Intel path disabled: skip transformation/storage entirely for performance & safety
      }

      // Step 7: Finalize
      result.status = 'completed';
      result.progress = 100;
      result.metadata.responseTime = Date.now() - startTime;

      return result;

    } catch (error) {
      console.error('Website scan failed:', error);
      result.status = 'error';
      result.title = 'Scan Failed';
      throw error;
    }
  }

  /**
   * Normalizes URL format
   */
  private normalizeUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    return normalized;
  }

  /**
   * Fetches the page through the desktop app or Starcom Uplink, the only routes
   * that can read it (siteFetcher, EX32).
   */
  private async fetchWithFallback(url: string): Promise<{
    html: string;
    metadata: Partial<WebsiteMetadata>;
    /**
     * The TARGET's response headers, or null when they could not be observed.
     *
     * Null is a real answer and callers must treat it as one. A CORS proxy
     * returns ITS headers, not the target's, and reporting those as the
     * target's is how this scanner came to publish fabricated findings.
     */
    realHeaders: Record<string, string> | null;
  }> {
    const fetcher = await siteFetcher();

    // The desktop app reads the page where CORS does not exist, and Uplink with
    // the person's leave for the site: either way the target's own headers and
    // status arrive intact. These are the only paths that can answer a
    // security-header question at all.
    if (fetcher) {
      const started = Date.now();
      const response = await fetcher.fetch(url, `NetRunner page scan you started, of ${new URL(url).hostname}`, { timeoutMs: 20_000 });
      return {
        html: response.body,
        metadata: {
          statusCode: response.status,
          responseTime: Date.now() - started,
          size: `${(response.bytes / 1024).toFixed(2)} KB`,
          contentType: response.headers['content-type'] ?? 'unknown',
          headers: response.headers,
          redirects: response.redirects,
          fetchedVia: fetcher.via,
        },
        realHeaders: response.headers,
      };
    }

    // No route in a browser, and no proxy asked (PAGE_SCAN_NEEDS_DESKTOP).
    throw new Error(PAGE_SCAN_NEEDS_DESKTOP);
  }

  /**
   * Advanced vulnerability analysis
   */
  private async analyzeVulnerabilities(
    html: string,
    doc: Document,
    url: string,
    realHeaders: Record<string, string> | null,
  ): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    // Security Headers Analysis
    const headerVulns = this.analyzeSecurityHeaders(realHeaders);
    vulnerabilities.push(...headerVulns);

    // Content Security Policy
    const cspVulns = this.analyzeCSP(doc);
    vulnerabilities.push(...cspVulns);

    // Mixed Content
    const mixedContentVulns = this.analyzeMixedContent(doc, url);
    vulnerabilities.push(...mixedContentVulns);

    // Form Security
    const formVulns = this.analyzeForms(doc);
    vulnerabilities.push(...formVulns);

    // External Dependencies
    const depVulns = this.analyzeExternalDependencies(doc);
    vulnerabilities.push(...depVulns);

    // Sensitive Data Exposure
    const dataVulns = this.analyzeSensitiveData(html, doc);
    vulnerabilities.push(...dataVulns);

    return vulnerabilities;
  }

  /**
   * Security headers, assessed only when they can actually be read.
   *
   * This used to substring-search the PAGE BODY for header names, because
   * script cannot read another origin's response headers and a CORS proxy
   * returns its own. The consequences ran in both directions: a site setting a
   * CSP correctly — as an HTTP header, the only real way — was reported as
   * MISSING it, and a page merely discussing CSP in its text was reported as
   * having one.
   *
   * Those were not weak findings, they were fabricated ones, published into a
   * pipeline whose entire premise is that weight derives from method. So when
   * the headers are unavailable this now reports NOTHING rather than guessing.
   * "We could not check" and "it is absent" are different statements about the
   * world, and only one of them was ever true here.
   */
  private analyzeSecurityHeaders(realHeaders: Record<string, string> | null): Vulnerability[] {
    const expected: Array<{ name: string; severity: Vulnerability['severity'] }> = [
      { name: 'content-security-policy', severity: 'high' },
      { name: 'x-frame-options', severity: 'medium' },
      { name: 'x-content-type-options', severity: 'medium' },
      { name: 'strict-transport-security', severity: 'medium' },
    ];

    if (realHeaders === null) {
      // Deliberately empty. See above: an unmeasured header is not a missing
      // one, and the honest report of an unmeasurable thing is silence.
      return [];
    }

    const present = new Set(Object.keys(realHeaders).map((k) => k.toLowerCase()));
    return expected
      .filter(({ name }) => !present.has(name))
      .map(({ name, severity }) => ({
        id: `missing-${name}`,
        title: `Missing ${name}`,
        type: 'security-header',
        severity,
        description: `The response did not carry ${name}.`,
        location: 'HTTP response headers',
        impact: 'Reduces protection against a class of client-side attacks.',
        recommendation: `Set ${name} on responses from this origin.`,
      }));
  }

  private analyzeCSP(doc: Document): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    const cspMeta = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
    
    if (!cspMeta) {
      vulnerabilities.push({
        id: 'no-csp',
        title: 'No Content Security Policy',
        type: 'csp',
        severity: 'high',
        description: 'No CSP found in meta tags or headers.',
        location: 'HTML Head',
        impact: 'Vulnerable to XSS and injection attacks',
        recommendation: 'Implement a strict Content Security Policy.'
      });
    }

    return vulnerabilities;
  }

  private analyzeMixedContent(doc: Document, url: string): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    
    if (url.startsWith('https://')) {
      const httpResources = doc.querySelectorAll('img[src^="http://"], script[src^="http://"], link[href^="http://"]');
      
      if (httpResources.length > 0) {
        vulnerabilities.push({
          id: 'mixed-content',
          title: 'Mixed Content Detected',
          type: 'mixed-content',
          severity: 'high',
          description: `Found ${httpResources.length} HTTP resources on HTTPS page.`,
          location: 'HTML Elements',
          impact: 'Compromises HTTPS security',
          recommendation: 'Replace all HTTP resources with HTTPS equivalents.'
        });
      }
    }

    return vulnerabilities;
  }

  private analyzeForms(doc: Document): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    const forms = doc.querySelectorAll('form');

    forms.forEach((form, index) => {
      // CSRF Protection
      const hasCSRF = form.querySelector('input[name*="csrf"], input[name*="token"], input[name="_token"]');
      if (!hasCSRF && form.method?.toLowerCase() === 'post') {
        vulnerabilities.push({
          id: `csrf-${index}`,
          title: 'Missing CSRF Protection',
          type: 'csrf',
          severity: 'medium',
          description: 'POST form lacks CSRF token protection.',
          location: `Form #${index + 1}`,
          impact: 'Vulnerable to Cross-Site Request Forgery',
          recommendation: 'Add CSRF tokens to all state-changing forms.'
        });
      }

      // Password field without HTTPS
      const hasPassword = form.querySelector('input[type="password"]');
      if (hasPassword && !form.action?.startsWith('https://')) {
        vulnerabilities.push({
          id: `insecure-password-${index}`,
          title: 'Insecure Password Transmission',
          type: 'password-security',
          severity: 'critical',
          description: 'Password field not transmitted over HTTPS.',
          location: `Form #${index + 1}`,
          impact: 'Password can be intercepted',
          recommendation: 'Ensure all password forms submit over HTTPS.'
        });
      }
    });

    return vulnerabilities;
  }

  private analyzeExternalDependencies(doc: Document): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];
    const externalScripts = doc.querySelectorAll('script[src^="http"]');
    
    externalScripts.forEach((script, index) => {
      const src = (script as HTMLScriptElement).src;
      const hasIntegrity = script.hasAttribute('integrity');
      
      if (!hasIntegrity) {
        vulnerabilities.push({
          id: `no-sri-${index}`,
          title: 'Missing Subresource Integrity',
          type: 'sri',
          severity: 'medium',
          description: `External script from ${new URL(src).hostname} lacks SRI.`,
          location: 'Script Tags',
          impact: 'Vulnerable to CDN compromise',
          recommendation: 'Add integrity attributes to external scripts.'
        });
      }
    });

    return vulnerabilities;
  }

  private analyzeSensitiveData(html: string, _doc: Document): Vulnerability[] {
    const vulnerabilities: Vulnerability[] = [];

    // Look for potential sensitive data in comments
    const commentRegex = /<!--[\s\S]*?-->/g;
    const comments = html.match(commentRegex) || [];
    
    comments.forEach((comment, index) => {
      if (/password|secret|key|token|api/i.test(comment)) {
        vulnerabilities.push({
          id: `sensitive-comment-${index}`,
          title: 'Sensitive Data in Comments',
          type: 'data-exposure',
          severity: 'low',
          description: 'HTML comments may contain sensitive information.',
          location: 'HTML Comments',
          impact: 'Information disclosure',
          recommendation: 'Remove sensitive data from HTML comments.'
        });
      }
    });

    return vulnerabilities;
  }

  /**
   * Extracts OSINT data from website
   */
  private extractOSINTData(html: string, doc: Document, url: string): OSINTData {
    return {
      emails: this.extractEmails(html),
      socialMedia: this.extractSocialMedia(doc),
      technologies: [], // Will be filled by detectTechnologies
      serverInfo: this.extractServerInfo(html),
      subdomains: this.extractSubdomains(doc, url),
      certificates: this.extractCertificateInfo(doc),
      dns: this.extractDNSInfo(doc)
    };
  }

  private extractEmails(html: string): string[] {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = html.match(emailRegex) || [];
    return [...new Set(emails)].slice(0, 20); // Limit to 20 unique emails
  }

  private extractSocialMedia(doc: Document): string[] {
    const socialDomains = ['facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com', 'youtube.com', 'tiktok.com', 'discord.gg'];
    const socialLinks: string[] = [];

    socialDomains.forEach(domain => {
      const links = doc.querySelectorAll(`a[href*="${domain}"]`);
      links.forEach(link => {
        const href = (link as HTMLAnchorElement).href;
        if (!socialLinks.includes(href)) {
          socialLinks.push(href);
        }
      });
    });

    return socialLinks.slice(0, 15);
  }

  private extractServerInfo(html: string): string[] {
    const serverInfo: string[] = [];
    const serverIndicators = [
      { pattern: /x-powered-by/i, tech: 'PHP/ASP.NET' },
      { pattern: /nginx/i, tech: 'Nginx' },
      { pattern: /apache/i, tech: 'Apache' },
      { pattern: /cloudflare/i, tech: 'Cloudflare' },
      { pattern: /aws/i, tech: 'AWS' }
    ];

    serverIndicators.forEach(({ pattern, tech }) => {
      if (pattern.test(html)) {
        serverInfo.push(tech);
      }
    });

    return serverInfo;
  }

  private extractSubdomains(doc: Document, originalUrl: string): string[] {
    const subdomains: string[] = [];
    const links = doc.querySelectorAll('a[href]');
    const originalDomain = new URL(originalUrl).hostname;

    links.forEach(link => {
      try {
        const href = (link as HTMLAnchorElement).href;
        const url = new URL(href);
        
        if (url.hostname !== originalDomain && url.hostname.endsWith(originalDomain.split('.').slice(-2).join('.'))) {
          if (!subdomains.includes(url.hostname)) {
            subdomains.push(url.hostname);
          }
        }
      } catch {
        // Invalid URL, skip
      }
    });

    return subdomains.slice(0, 10);
  }

  private extractCertificateInfo(_doc: Document): CertificateInfo[] {
    // Limited in browser environment
    return [];
  }

  private extractDNSInfo(_doc: Document): DNSRecord[] {
    // Limited in browser environment
    return [];
  }

  /**
   * Advanced technology detection
   */
  private detectTechnologies(html: string, doc: Document): Technology[] {
    const technologies: Technology[] = [];

    // Framework detection
    const frameworks = [
      { name: 'React', patterns: [/react/i, /_react/i, /reactdom/i], category: 'framework' as const },
      { name: 'Angular', patterns: [/angular/i, /ng-/i], category: 'framework' as const },
      { name: 'Vue.js', patterns: [/vue/i, /v-/i], category: 'framework' as const },
      { name: 'Next.js', patterns: [/next\.js/i, /__next/i], category: 'framework' as const },
      { name: 'Nuxt.js', patterns: [/nuxt/i], category: 'framework' as const }
    ];

    // Library detection
    const libraries = [
      { name: 'jQuery', patterns: [/jquery/i, /\$\(/], category: 'library' as const },
      { name: 'Lodash', patterns: [/lodash/i, /_\./], category: 'library' as const },
      { name: 'Bootstrap', patterns: [/bootstrap/i, /\.bs-/], category: 'library' as const },
      { name: 'Tailwind CSS', patterns: [/tailwind/i, /tw-/], category: 'library' as const }
    ];

    // Analytics detection
    const analytics = [
      { name: 'Google Analytics', patterns: [/google-analytics/i, /gtag/i], category: 'analytics' as const },
      { name: 'Google Tag Manager', patterns: [/googletagmanager/i, /gtm/i], category: 'analytics' as const }
    ];

    const allTechs = [...frameworks, ...libraries, ...analytics];

    allTechs.forEach(tech => {
      let confidence = 0;
      tech.patterns.forEach(pattern => {
        if (pattern.test(html)) {
          confidence += 25;
        }
      });

      if (confidence > 0) {
        technologies.push({
          name: tech.name,
          category: tech.category,
          confidence: Math.min(confidence, 100)
        });
      }
    });

    // Meta generator detection
    const generator = doc.querySelector('meta[name="generator"]')?.getAttribute('content');
    if (generator) {
      technologies.push({
        name: generator,
        category: 'cms',
        confidence: 90
      });
    }

    return technologies;
  }

  /**
   * Transform scan result to Intel objects for storage integration
   */
  private transformToIntel(scanResult: ScanResult): Intel[] {
    const intelObjects: Intel[] = [];
    const baseTimestamp = Date.now();
    const collectedBy = 'netrunner-websitescanner';
    
    try {
      // Generate Intel from emails
      scanResult.osintData.emails.forEach((email, index) => {
        const intel: Intel = {
          id: `intel-email-${baseTimestamp}-${index}`,
          source: 'OSINT',
          qualityAssessment: {
            sourceQuality: 'unverified',
            visibility: 'public',
            sensitivity: 'open'
          },
          reliability: this.assessEmailReliability(email),
          timestamp: baseTimestamp,
          collectedBy,
          location: scanResult.url,
          data: {
            email,
            source_url: scanResult.url,
            scan_timestamp: scanResult.timestamp,
            extraction_method: 'html_parsing'
          },
          tags: ['email', 'contact', 'osint', 'netrunner', 'website-scan'],
          verified: false,
          bridgeMetadata: {
            transformationId: `netrunner-email-${baseTimestamp}-${index}`,
            transformedAt: baseTimestamp,
            transformationVersion: '1.0.0',
            preservedFields: ['data', 'source', 'timestamp'],
            enhancedFields: ['reliability', 'tags', 'qualityAssessment']
          }
        };
        intelObjects.push(intel);
      });

      // Generate Intel from social media links
      scanResult.osintData.socialMedia.forEach((social, index) => {
        const intel: Intel = {
          id: `intel-social-${baseTimestamp}-${index}`,
          source: 'OSINT',
          qualityAssessment: {
            sourceQuality: 'unverified',
            visibility: 'public',
            sensitivity: 'open'
          },
          reliability: 'C', // Fairly reliable for public social media
          timestamp: baseTimestamp,
          collectedBy,
          location: scanResult.url,
          data: {
            social_media_url: social,
            platform: this.getSocialPlatform(social),
            source_url: scanResult.url,
            scan_timestamp: scanResult.timestamp,
            extraction_method: 'html_parsing'
          },
          tags: ['social-media', 'osint', 'netrunner', 'website-scan', this.getSocialPlatform(social)],
          verified: false,
          bridgeMetadata: {
            transformationId: `netrunner-social-${baseTimestamp}-${index}`,
            transformedAt: baseTimestamp,
            transformationVersion: '1.0.0',
            preservedFields: ['data', 'source', 'timestamp'],
            enhancedFields: ['reliability', 'tags', 'qualityAssessment']
          }
        };
        intelObjects.push(intel);
      });

      // Generate Intel from technologies
      scanResult.osintData.technologies.forEach((tech, index) => {
        const intel: Intel = {
          id: `intel-tech-${baseTimestamp}-${index}`,
          source: 'OSINT',
          qualityAssessment: {
            sourceQuality: 'unverified',
            visibility: 'public',
            sensitivity: 'open'
          },
          reliability: tech.confidence > 80 ? 'B' : 'C',
          timestamp: baseTimestamp,
          collectedBy,
          location: scanResult.url,
          data: {
            technology: tech.name,
            version: tech.version,
            category: tech.category,
            confidence: tech.confidence,
            source_url: scanResult.url,
            scan_timestamp: scanResult.timestamp,
            detection_method: 'signature_analysis'
          },
          tags: ['technology', 'infrastructure', 'osint', 'netrunner', 'website-scan', tech.category],
          verified: false,
          bridgeMetadata: {
            transformationId: `netrunner-tech-${baseTimestamp}-${index}`,
            transformedAt: baseTimestamp,
            transformationVersion: '1.0.0',
            preservedFields: ['data', 'source', 'timestamp'],
            enhancedFields: ['reliability', 'tags', 'qualityAssessment']
          }
        };
        intelObjects.push(intel);
      });

      // Generate Intel from vulnerabilities
      scanResult.vulnerabilities.forEach((vuln, index) => {
        const intel: Intel = {
          id: `intel-vuln-${baseTimestamp}-${index}`,
          source: 'OSINT',
          qualityAssessment: {
            sourceQuality: 'reliable',
            visibility: vuln.severity === 'critical' ? 'limited' : 'public',
            sensitivity: vuln.severity === 'critical' ? 'protected' : 'careful'
          },
          reliability: 'B', // Usually reliable for vulnerability scans
          timestamp: baseTimestamp,
          collectedBy,
          location: scanResult.url,
          data: {
            vulnerability: {
              id: vuln.id,
              title: vuln.title,
              type: vuln.type,
              severity: vuln.severity,
              description: vuln.description,
              location: vuln.location,
              impact: vuln.impact,
              recommendation: vuln.recommendation,
              cve: vuln.cve,
              score: vuln.score
            },
            source_url: scanResult.url,
            scan_timestamp: scanResult.timestamp,
            detection_method: 'security_analysis'
          },
          tags: ['vulnerability', 'security', 'osint', 'netrunner', 'website-scan', vuln.severity],
          verified: false,
          bridgeMetadata: {
            transformationId: `netrunner-vuln-${baseTimestamp}-${index}`,
            transformedAt: baseTimestamp,
            transformationVersion: '1.0.0',
            preservedFields: ['data', 'source', 'timestamp'],
            enhancedFields: ['reliability', 'tags', 'qualityAssessment']
          }
        };
        intelObjects.push(intel);
      });

    } catch (error) {
      console.error('Error transforming scan result to Intel objects:', error);
    }

    return intelObjects;
  }

  /**
   * Assess email reliability based on format and domain
   */
  private assessEmailReliability(email: string): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'X' {
    // Basic email validation and domain assessment
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'E'; // Unreliable - invalid format
    }
    
    const domain = email.split('@')[1]?.toLowerCase();
    const commonDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
    
    if (commonDomains.includes(domain)) {
      return 'C'; // Fairly reliable - common public domain
    }
    
    return 'B'; // Usually reliable - appears to be organizational email
  }

  /**
   * Extract social media platform from URL
   */
  private getSocialPlatform(url: string): string {
    const urlLower = url.toLowerCase();
    if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) return 'twitter';
    if (urlLower.includes('facebook.com')) return 'facebook';
    if (urlLower.includes('linkedin.com')) return 'linkedin';
    if (urlLower.includes('instagram.com')) return 'instagram';
    if (urlLower.includes('youtube.com')) return 'youtube';
    if (urlLower.includes('tiktok.com')) return 'tiktok';
    return 'unknown';
  }
}

// Export singleton instance
export const websiteScanner = new WebsiteScannerService();
