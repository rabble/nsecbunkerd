#!/usr/bin/env node

/**
 * nsecBunker - A secure key management system for Nostr
 * 
 * @description
 * A CLI application that provides secure management of Nostr private keys (nsec).
 * The bunker acts as a secure gateway, allowing controlled access to signing operations
 * while keeping private keys encrypted at rest.
 * 
 * @commands
 * - setup: Initialize a new nsecBunker configuration file
 * - start: Launch the nsecBunker service daemon
 * - add: Securely store a new private key in the bunker
 * 
 * @environment
 * ADMIN_NPUBS - Comma-separated list of administrator public keys (npub)
 */

import 'websocket-polyfill';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { setup } from './commands/setup.js';
import { addNsec } from './commands/add.js';
import { start } from './commands/start.js';

/**
 * Administrator public keys can be specified via ADMIN_NPUBS environment variable
 * Format: npub1,npub2,npub3
 */
const adminNpubs = process.env.ADMIN_NPUBS ? process.env.ADMIN_NPUBS.split(',') : [];

const argv = yargs(hideBin(process.argv))
    /**
     * Setup Command
     * Initializes a new nsecBunker configuration with secure defaults
     * 
     * Generated config includes:
     * - admin.key: Auto-generated admin authentication key
     * - nostr.relays: List of default Nostr relays
     * - database: URI for persistent storage
     * - logs: Path for application logs
     */
    .command('setup', 'Setup nsecBunker', {}, (argv) => {
        setup(argv.config as string);
    })

    /**
     * Start Command
     * Launches the nsecBunker service with specified configuration
     * 
     * @options
     * --verbose, -v: Enable detailed logging output
     * --key <name>: Enable specific named keys (can specify multiple)
     * --admin, -a <npub>: Additional admin public keys (can specify multiple)
     */
    .command('start', 'Start nsecBunker', (yargs) => {
        yargs
            .option('verbose', {
                alias: 'v',
                type: 'boolean',
                description: 'Run with verbose logging',
                default: false,
            })
            .array('key')
            .option('key <name>', {
                type: 'string',
                description: 'Name of key to enable',
            })
            .array('admin')
            .option('admin <npub>', {
                alias: 'a',
                type: 'string',
                description: 'Admin npub',
            });
    }, (argv) => {
        start({
            keys: argv.key as string[],      // List of specific keys to enable
            verbose: argv.verbose as boolean, // Verbose logging flag
            config: argv.config as string,    // Configuration file path
            adminNpubs: [...new Set([...((argv.admin||[]) as string[]), ...adminNpubs])] // Deduplicated admin NPUBs
        });
    })

    /**
     * Add Command
     * Securely stores a new private key in the bunker
     * 
     * Storage format in config:
     * ```json
     * {
     *   "keys": {
     *     "<keyId>": {
     *       "iv": "initialization vector",
     *       "data": "encrypted key data",
     *       // or
     *       "key": "unencrypted key (if encryption disabled)"
     *     }
     *   }
     * }
     * ```
     * 
     * @options
     * --name, -n: Unique identifier for the key (required)
     */
    .command('add', 'Add an nsec', (yargs) => {
        yargs
            .option('name', {
                alias: 'n',
                type: 'string',
                description: 'Name of the nsec',
                demandOption: true,
            });
    }, (argv) => {
        addNsec({
            config: argv.config as string,
            name: argv.name as string
        });
    })

    // Global options available to all commands
    .options({
        'config': {
            alias: 'c',
            type: 'string',
            description: 'Path to config file',
            default: 'config/nsecbunker.json',
        },
    })
    .demandCommand(0, 1)
    .parse();
