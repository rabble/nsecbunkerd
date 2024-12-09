/**
 * Configuration management for nsecBunker
 * 
 * This module handles the reading, writing, and type definitions for the nsecbunker.json
 * configuration file. The configuration controls all aspects of the bunker's operation,
 * including admin access, relay connections, and key storage.
 */

import { readFileSync, writeFileSync } from 'fs';
import { NDKPrivateKeySigner, NDKUserProfile } from '@nostr-dev-kit/ndk';
import { IAdminOpts } from '../daemon/admin';
import { version } from '../../package.json';

// Generate a default private key for bunker communication
const generatedKey = NDKPrivateKeySigner.generate();

// LNBits wallet integration configuration
export type LNBitsWalletConfig = {
    url: string,
    key: string,
    nostdressUrl: string,
}

export interface IWalletConfig {
    lnbits?: LNBitsWalletConfig;
}

/**
 * Configuration for individual domains
 * Used when creating new users and managing NIP-05 verifications
 */
export interface DomainConfig {
    // The file pointing to the domain's NIP-05 verification
    nip05: string;
    nip89?: {
        profile: Record<string, string>;
        operator?: string;
        relays: string[];
    },
    wallet?: IWalletConfig;
    defaultProfile?: Record<string, string>;
};

/**
 * Main configuration interface for nsecBunker
 * All properties are optional unless otherwise noted in the documentation
 */
export interface IConfig {
    // Nostr relay configuration for NIP-46 requests
    nostr: {
        relays: string[];
    };
    // Admin configuration for bunker management
    admin: IAdminOpts;
    // Port for OAuth-like authentication flow
    authPort?: number;
    // Host for OAuth-like authentication flow
    authHost?: string;
    // Database URI for storing bunker data
    database: string;
    // Path for log file storage
    logs: string;
    // Storage for encrypted and unencrypted keys
    // Format: keys.$keyId.iv + keys.$keyId.data (encrypted)
    //         keys.$keyId.key (unencrypted)
    keys: Record<string, any>;
    // URL for OAuth-like authentication access
    baseUrl?: string;
    // Enable detailed logging when true
    verbose: boolean;
    // Allowed domains for user creation
    domains?: Record<string, DomainConfig>;
}

/**
 * Default configuration used when no config file exists
 * Provides minimal setup for basic bunker operation
 */
const defaultConfig: IConfig = {
    nostr: {
        relays: [
            'wss://relay.damus.io',
            "wss://relay.nsecbunker.com"
        ]
    },
    admin: {
        npubs: [],                           // Admin NPUBs allowed to manage the bunker
        adminRelays: [                       // Relays for admin commands
            "wss://relay.nsecbunker.com"
        ],
        key: generatedKey.privateKey!,       // Auto-generated bunker private key
        notifyAdminsOnBoot: true,
    },
    database: 'sqlite://nsecbunker.db',
    logs: './nsecbunker.log',
    keys: {},                               // Empty key storage by default
    verbose: false,
};

/**
 * Reads and processes the configuration file
 * Creates default config if none exists
 * Ensures all required properties are present
 */
async function getCurrentConfig(config: string): Promise<IConfig> {
    try {
        const configFileContents = readFileSync(config, 'utf8');

        // Update config with current version and defaults
        const currentConfig = JSON.parse(configFileContents);
        currentConfig.version = version;
        currentConfig.admin.notifyAdminsOnBoot ??= true;

        return currentConfig;
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            // Create new config file with defaults if none exists
            await saveCurrentConfig(config, defaultConfig);
            return defaultConfig;
        } else {
            console.error(`Error reading config file: ${err.message}`);
            process.exit(1);
        }
    }
}

/**
 * Saves the current configuration to disk
 * Automatically includes the current bunker version
 */
export function saveCurrentConfig(config: string, currentConfig: any) {
    try {
        currentConfig.version = version;
        const configString = JSON.stringify(currentConfig, null, 2);
        writeFileSync(config, configString);
    } catch (err: any) {
        console.error(`Error writing config file: ${err.message}`);
        process.exit(1);
    }
}
export {getCurrentConfig};

