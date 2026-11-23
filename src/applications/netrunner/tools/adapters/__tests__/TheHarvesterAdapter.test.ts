/**
 * TheHarvesterAdapter.test.ts
 * 
 * Test suite for the TheHarvesterAdapter tool adapter.
 */

import { describe, expect, test, beforeEach, vi } from 'vitest';
import axios from 'axios';
import { TheHarvesterAdapter, THEHARVESTER_NOT_AVAILABLE } from '../TheHarvesterAdapter';
import { ToolExecutionRequest } from '../../NetRunnerPowerTools';

describe('TheHarvesterAdapter', () => {
  let adapter: TheHarvesterAdapter;

  beforeEach(async () => {
    adapter = new TheHarvesterAdapter();
    await adapter.initialize();
  });

  test('should initialize correctly', () => {
    const toolId = adapter.getToolId();
    expect(toolId).toBeDefined();
    expect(typeof toolId).toBe('string');
    
    const schema = adapter.getToolSchema();
    expect(schema.id).toBe(toolId);
    expect(schema.name).toBe('theHarvester');
    expect(schema.description).toContain('Email, subdomain and name harvester');
  });

  test('should validate parameters correctly', () => {
    // Valid email gathering parameters
    expect(adapter.validateParameters({
      operation: 'emails',
      domain: 'example.com',
      limit: 10
    })).toBe(true);

    // Valid subdomain gathering parameters
    expect(adapter.validateParameters({
      operation: 'subdomains',
      domain: 'example.com',
      limit: 20
    })).toBe(true);

    // Valid names gathering parameters (using company instead of domain)
    expect(adapter.validateParameters({
      operation: 'names',
      company: 'Acme Corp'
    })).toBe(true);

    // Missing required parameter
    expect(adapter.validateParameters({})).toBe(false);

    // Valid with just operation (domain is not required)
    expect(adapter.validateParameters({
      operation: 'emails'
    })).toBe(true);

    // Invalid parameter types
    expect(adapter.validateParameters({
      operation: 'emails',
      domain: 123, // should be string
      limit: 10
    })).toBe(false);

    expect(adapter.validateParameters({
      operation: 'emails',
      domain: 'example.com',
      limit: 'ten' // should be number
    })).toBe(false);

    // Invalid operation
    expect(adapter.validateParameters({
      operation: 'invalid_operation',
      domain: 'example.com',
      limit: 10
    })).toBe(false);
  });

  test('without a theHarvester service, every operation says it is not available and returns no data', async () => {
    const requests: Array<Record<string, unknown>> = [
      { operation: 'emails', domain: 'example.com', limit: 5 },
      { operation: 'subdomains', domain: 'example.com' },
      { operation: 'names', company: 'Acme Corp' },
    ];
    for (const parameters of requests) {
      const response = await adapter.execute({
        toolId: adapter.getToolId(),
        parameters,
        requestId: `request-${parameters.operation}`,
        timestamp: Date.now()
      });
      expect(response.status).toBe('error');
      expect(response.data).toBeNull();
      expect(response.error).toBe(THEHARVESTER_NOT_AVAILABLE);
    }
  });

  test('with a theHarvester service, asks it and returns its answer', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { domain: 'example.com', emails: ['press@example.com'], count: 1 }
    });
    try {
      const served = new TheHarvesterAdapter('https://harvester.internal');
      await served.initialize();
      const response = await served.execute({
        toolId: served.getToolId(),
        parameters: { operation: 'emails', domain: 'example.com', limit: 5 },
        requestId: 'request-served',
        timestamp: Date.now()
      });
      expect(post).toHaveBeenCalledWith(
        'https://harvester.internal/harvest/emails',
        expect.objectContaining({ domain: 'example.com', limit: 5 }),
        expect.anything()
      );
      expect(response.status).toBe('success');
      expect((response.data as { emails: string[] }).emails).toEqual(['press@example.com']);
    } finally {
      post.mockRestore();
    }
  });

  test('accepts a subdomain or a multi-part suffix as the domain, and still refuses a non-domain', () => {
    expect(adapter.validateParameters({ operation: 'subdomains', domain: 'www.example.com' })).toBe(true);
    expect(adapter.validateParameters({ operation: 'emails', domain: 'mail.example.co.uk' })).toBe(true);
    expect(adapter.validateParameters({ operation: 'emails', domain: 'not a domain' })).toBe(false);
  });

  test('should handle execution errors gracefully', async () => {
    // Simulate error by providing invalid parameters
    const request: ToolExecutionRequest = {
      toolId: adapter.getToolId(),
      parameters: {},
      requestId: 'test-request-4',
      timestamp: Date.now()
    };

    const response = await adapter.execute(request);

    expect(response.status).toBe('error');
    expect(response.error).toBeDefined();
    expect(response.error).toContain('Invalid parameters');
  });

  test('should return correct tool schema', () => {
    const schema = adapter.getToolSchema();
    
    expect(schema.parameters).toBeDefined();
    expect(schema.parameters.length).toBeGreaterThan(0);
    
    // Check for required operation parameter
    const operationParam = schema.parameters.find(p => p.name === 'operation');
    expect(operationParam).toBeDefined();
    expect(operationParam?.required).toBe(true);
    expect(operationParam?.type).toBe('string');
    expect(operationParam?.options).toContain('emails');
    expect(operationParam?.options).toContain('subdomains');
    expect(operationParam?.options).toContain('names');
    
    // Check for optional domain parameter
    const domainParam = schema.parameters.find(p => p.name === 'domain');
    expect(domainParam).toBeDefined();
    expect(domainParam?.required).toBe(false); // domain is optional
    expect(domainParam?.type).toBe('string');
    
    // Check for optional limit parameter
    const limitParam = schema.parameters.find(p => p.name === 'limit');
    expect(limitParam).toBeDefined();
    expect(limitParam?.required).toBe(false);
    expect(limitParam?.type).toBe('number');
  });

});
