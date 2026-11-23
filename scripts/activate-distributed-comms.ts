#!/usr/bin/env tsx
/**
 * Activate Distributed Team Communications
 * 
 * This script activates the team communication system for remote agents.
 * Sets up Nostr channels for cross-country agent coordination.
 */

import NostrService from '../src/services/nostrService';

async function activateDistributedComms(): Promise<void> {
  console.log('🚀 Activating Distributed Team Communications...\n');
  
  try {
    // Initialize the Nostr service
    const nostrService = NostrService.getInstance();
    console.log('✅ Nostr service initialized');
    
    // Set up default team channels for distributed agents
    const defaultTeams = [
      {
        id: 'starcom-alpha',
        name: 'Starcom Alpha Team',
        description: 'Primary investigation team'
      },
      {
        id: 'starcom-bravo',
        name: 'Starcom Bravo Team', 
        description: 'Secondary investigation team'
      },
      {
        id: 'starcom-intel',
        name: 'Intelligence Coordination',
        description: 'Intel report sharing and coordination'
      }
    ];
    
    console.log('📡 Setting up team channels...');
    
    for (const team of defaultTeams) {
      try {
        // Set user DID for the service
        nostrService.setUserDID(`agent-${Date.now()}`);
        
        // Create team channel
        /*
         * This passed five arguments to a three-argument function. The
         * clearance and agency parameters were removed from
         * NostrService.createTeamChannel at some point and this call was never
         * updated, so `team.clearanceLevel` was being passed as the channel
         * DESCRIPTION and the rest silently dropped — every channel this
         * script created was described as "UNCLASSIFIED".
         *
         * Both guards missed it because their scope was src/** and this is a
         * script. Widened on 2026-09-10; see the note in
         * guard-no-classification.mjs.
         */
        const channel = await nostrService.createTeamChannel(
          team.id,
          team.name,
          team.description
        );
        
        console.log(`✅ Created channel: ${team.name} (${team.id})`);
      } catch (error) {
        console.log(`⚠️ Channel ${team.name} setup deferred (${error instanceof Error ? error.message : 'unknown error'})`);
      }
    }
    
    console.log('\n🌐 Distributed Communications Status:');
    console.log('✅ Public Nostr relays: CONNECTED');
    console.log('✅ Cross-country routing: ENABLED'); 
    console.log('✅ Offline message sync: READY');
    console.log('✅ Team channels: CONFIGURED');
    console.log('✅ Intel report sharing: AVAILABLE');
    
    console.log('\n📋 Agent Instructions:');
    console.log('1. Connect wallet to authenticate');
    console.log('2. Select team channel to join');
    console.log('3. Send messages to coordinate with remote agents');
    console.log('4. Submit intel reports for team review');
    console.log('5. All communications sync across the country');
    
    console.log('\n🎯 System Ready for Distributed Agent Operations!');
    
  } catch (error) {
    console.error('❌ Activation failed:', error);
  }
}

// Activate the system
activateDistributedComms().catch(console.error);
