// Mock data for development/fallback when API is unavailable
// Matches the normalized internal data structure

export const MOCK_DATA = [
  // Report summary
  {
    item_type: 'report_summary',
    scan_start: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    report_id: 'report-2025-03-22-001',
    total_high_severity_count: 5,
    raw: {}
  },

  // Critical findings
  {
    item_type: 'finding',
    name: 'Apache OpenSSL DoS Vulnerability (CVE-2023-0464)',
    host: '192.168.1.100',
    port: 443,
    severity: 'Critical',
    severity_num: 9.8,
    cvss: '9.8',
    cves: ['CVE-2023-0464'],
    description: 'A buffer overflow vulnerability in OpenSSL allows remote code execution.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.145862'
  },
  {
    item_type: 'finding',
    name: 'MySQL Root Access Without Authentication',
    host: '10.0.0.50',
    port: 3306,
    severity: 'Critical',
    severity_num: 10.0,
    cvss: '10.0',
    cves: ['CVE-2022-21245'],
    description: 'MySQL database is exposed without requiring authentication on the network.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.103785'
  },
  {
    item_type: 'finding',
    name: 'Unpatched Windows RDP Vulnerability (CVE-2023-21889)',
    host: 'WIN-SERVER-01',
    port: 3389,
    severity: 'Critical',
    severity_num: 9.6,
    cvss: '9.6',
    cves: ['CVE-2023-21889'],
    description: 'Remote Desktop Protocol is vulnerable to pre-authentication code execution.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.146315'
  },
  {
    item_type: 'finding',
    name: 'Weak SSH Key Exchange Algorithms',
    host: 'linux-prod-01',
    port: 22,
    severity: 'Critical',
    severity_num: 9.1,
    cvss: '9.1',
    cves: ['CVE-2023-25136'],
    description: 'SSH server supports weak key exchange algorithms that enable downgrade attacks.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.103591'
  },

  // High severity findings
  {
    item_type: 'finding',
    name: 'Apache Server Information Disclosure',
    host: '192.168.1.200',
    port: 80,
    severity: 'High',
    severity_num: 8.5,
    cvss: '8.5',
    cves: ['CVE-2023-25815'],
    description: 'Apache HTTP Server version is exposed in HTTP headers, disclosing system information.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.103591'
  },
  {
    item_type: 'finding',
    name: 'SSL/TLS Self-Signed Certificate',
    host: '10.0.1.25',
    port: 443,
    severity: 'High',
    severity_num: 8.1,
    cvss: '8.1',
    cves: [],
    description: 'Web server uses a self-signed certificate instead of a valid CA-signed certificate.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.104743'
  },
  {
    item_type: 'finding',
    name: 'Insecure Direct Object Reference (IDOR)',
    host: '192.168.1.200',
    port: 8080,
    severity: 'High',
    severity_num: 7.9,
    cvss: '7.9',
    cves: ['CVE-2023-28245'],
    description: 'Web application allows accessing other users\' resources by manipulating parameter values.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.145892'
  },
  {
    item_type: 'finding',
    name: 'FTP Server Anonymous Access Enabled',
    host: '10.0.0.30',
    port: 21,
    severity: 'High',
    severity_num: 7.5,
    cvss: '7.5',
    cves: ['CVE-2021-22911'],
    description: 'FTP server allows anonymous login without credentials, exposing files.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.103784'
  },

  // Medium severity findings
  {
    item_type: 'finding',
    name: 'Outdated jQuery Library (XSS vulnerability)',
    host: '192.168.1.200',
    port: 80,
    severity: 'Medium',
    severity_num: 6.2,
    cvss: '6.2',
    cves: ['CVE-2020-11022'],
    description: 'jQuery version is outdated and vulnerable to Cross-Site Scripting attacks.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.145891'
  },
  {
    item_type: 'finding',
    name: 'Missing Security Headers',
    host: '192.168.1.200',
    port: 80,
    severity: 'Medium',
    severity_num: 5.8,
    cvss: '5.8',
    cves: [],
    description: 'HTTP response headers lack security directives such as X-Frame-Options and Content-Security-Policy.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.145890'
  },
  {
    item_type: 'finding',
    name: 'Weak Password Policy',
    host: 'WIN-SERVER-01',
    port: null,
    severity: 'Medium',
    severity_num: 5.3,
    cvss: '5.3',
    cves: ['CVE-2023-32315'],
    description: 'Windows Server password policy allows short passwords without complexity requirements.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.146314'
  },
  {
    item_type: 'finding',
    name: 'Disabled Windows Firewall',
    host: 'WIN-CLIENT-05',
    port: null,
    severity: 'Medium',
    severity_num: 5.1,
    cvss: '5.1',
    cves: [],
    description: 'Windows Firewall is disabled on this system, allowing unrestricted network access.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.146312'
  },

  // Low severity findings
  {
    item_type: 'finding',
    name: 'Banner Grabbing Information Exposure',
    host: '192.168.1.100',
    port: 80,
    severity: 'Low',
    severity_num: 3.7,
    cvss: '3.7',
    cves: [],
    description: 'Server banners reveal service and version information that aids reconnaissance.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.103591'
  },
  {
    item_type: 'finding',
    name: 'Outdated TLS Version (TLS 1.0/1.1)',
    host: '10.0.0.50',
    port: 3306,
    severity: 'Low',
    severity_num: 3.1,
    cvss: '3.1',
    cves: ['CVE-2016-2183'],
    description: 'Server supports deprecated TLS 1.0 and 1.1 which are no longer secure.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.103591'
  },
  {
    item_type: 'finding',
    name: 'Temporary Files Not Cleaned',
    host: 'linux-prod-01',
    port: null,
    severity: 'Low',
    severity_num: 2.8,
    cvss: '2.8',
    cves: [],
    description: 'Temporary files left over from previous builds found in /tmp directory.',
    reference: 'nvt:1.3.6.1.4.1.25623.1.0.145889'
  }
]

export function generateMockDataForDemo() {
  return MOCK_DATA
}
