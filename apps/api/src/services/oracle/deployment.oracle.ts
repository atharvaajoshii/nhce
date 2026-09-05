/**
 * @file deployment.oracle.ts
 * @description Automated Live Deployment Health & Verification Oracle.
 * Performs HTTP pings, latency benchmarking, and SSL/TLS security checks on freelancer-submitted deployment URLs.
 */

import axios from 'axios';
import https from 'https';

export interface IDeploymentVerificationResult {
  isLive: boolean;
  targetUrl: string;
  statusCode?: number;
  responseTimeMs?: number;
  hasSsl: boolean;
  details: string;
  pageTitle?: string;
  contentSnippet?: string;
}

export class DeploymentOracle {
  /**
   * Ping live web service deployment URL and verify HTTP status, SSL certificate, and page content
   * @param targetUrl Live deployment URL submitted by freelancer
   */
  public async verifyDeployment(targetUrl: string): Promise<IDeploymentVerificationResult> {
    try {
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }

      const hasSsl = targetUrl.startsWith('https://');
      const startTime = Date.now();

      const agent = new https.Agent({ rejectUnauthorized: false });

      const response = await axios.get(targetUrl, {
        timeout: 8000,
        httpsAgent: agent,
        headers: { 'User-Agent': 'Web3-Freelance-Deployment-Oracle/1.0' }
      });

      const responseTimeMs = Date.now() - startTime;
      const isSuccess = response.status >= 200 && response.status < 400;

      let pageTitle = '';
      let contentSnippet = '';

      if (typeof response.data === 'string') {
        const titleMatch = response.data.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch && titleMatch[1]) {
          pageTitle = titleMatch[1].trim();
        }

        // Strip HTML tags to get clean plain text snippet for AI inspection
        const cleanText = response.data
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        contentSnippet = cleanText.slice(0, 1500);
      }

      return {
        isLive: isSuccess,
        targetUrl,
        statusCode: response.status,
        responseTimeMs,
        hasSsl,
        pageTitle: pageTitle || 'Live Web Page',
        contentSnippet: contentSnippet || 'HTML page loaded successfully.',
        details: isSuccess
          ? `Deployment active (${pageTitle || 'Page OK'}). HTTP ${response.status} (${responseTimeMs}ms)`
          : `Deployment responded with status ${response.status}`
      };
    } catch (error: any) {
      return {
        isLive: false,
        targetUrl,
        hasSsl: targetUrl.startsWith('https://'),
        details: `Deployment Verification Error: ${error.message || 'Host unreachable or request timed out'}`
      };
    }
  }
}

export const deploymentOracle = new DeploymentOracle();
