/**
 * CLI client for interacting with nsecBunker
 * 
 * This client provides command-line functionality for:
 * - Signing events using NIP-46 protocol
 * - Creating new Nostr accounts
 * - Managing authorization flows
 * - Publishing signed events to relays
 * 
 * Security Model:
 * - Uses local private key for client authentication
 * - Communicates with nsecBunker through encrypted channels
 * - Supports NIP-05 identifier resolution
 * - Implements NIP-46 signing protocol
 * 
 * @module nsecbunker-client
 */

import "websocket-polyfill";
import NDK, { NDKUser, NDKEvent, NDKPrivateKeySigner, NDKNip46Signer, NostrEvent } from '@nostr-dev-kit/ndk';
import fs from 'fs';

// Command line argument parsing
const args = process.argv;
const command = process.argv[2];
let remotePubkey = process.argv[3];
let content = process.argv[4];
const dontPublish = process.argv.includes('--dont-publish');
const debug = process.argv.includes('--debug');
let signer: NDKNip46Signer;
let ndk: NDK;
let remoteUser: NDKUser;

// Parse relay list from command line arguments
const relaysIndex = args.findIndex(arg => arg === '--relays');
let relays: string[] = [];

if (relaysIndex !== -1 && args[relaysIndex + 1]) {
    relays = args[relaysIndex + 1].split(',');
}

/**
 * Display usage instructions when no command is provided
 */
if (!command) {
    console.log('Usage: node src/client.js <command> <remote-npub> <content> [--dont-publish] [--debug] [--pk <key>]');
    console.log('');
    console.log(`\t<command>:          command to run (ping, sign)`);
    console.log(`\t<remote-npub>:      npub that should be published as`);
    console.log(`\t<content>:          sign flow: event JSON to sign (no need for pubkey or id fields) | or kind:1 content string to sign\n`);
    console.log(`\t                    create_account flow: [desired-nip05[,desired-domain,[email]]]`);
    console.log('\t--debug:            enable debug mode');
    console.log('\t--relays:           list of relays to publish to (separated by commas)');
    process.exit(1);
}

/**
 * Creates and configures a new NDK instance
 * Connects to nsecBunker relay and any additional specified relays
 */
async function createNDK(): Promise<NDK> {
    const ndk = new NDK({
        explicitRelayUrls: [
            'wss://relay.nsecbunker.com',
            ...relays
        ],
        enableOutboxModel: false
    });
    if (debug) {
        ndk.pool.on('relay:disconnect', () => console.log('❌ disconnected'));
    }
    await ndk.connect(5000);

    return ndk;
}

/**
 * Gets the path for storing the client's private key
 * Uses home directory for cross-platform compatibility
 */
function getPrivateKeyPath() {
    const home = process.env.HOME || process.env.USERPROFILE;
    return `${home}/.nsecbunker-client-private.key`;
}

/**
 * Saves the client's private key to disk
 * Creates directory if it doesn't exist
 */
function savePrivateKey(pk: string) {
    const path = getPrivateKeyPath();
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }
    fs.writeFileSync(`${path}/private.key`, pk);
}

/**
 * Loads the client's private key from disk
 * Returns undefined if key doesn't exist
 */
function loadPrivateKey(): string | undefined {
    const path = getPrivateKeyPath();
    if (!fs.existsSync(path)) {
        return undefined;
    }
    return fs.readFileSync(`${path}/private.key`).toString();
}

// Main execution block
(async () => {
    let remoteUser: NDKUser;

    ndk = await createNDK();

    // Handle NIP-05 identifier resolution
    if (command === 'create_account' && !remotePubkey.startsWith("npub")) {
        let [ username, domain ] = remotePubkey.split('@');

        if (!domain) {
            domain = username;
            username = Math.random().toString(36).substring(2, 15);
        }

        content = `${username},${domain}`

        const u = await NDKUser.fromNip05(domain, ndk);
        if (!u) {
            console.log(`Invalid nip05 ${remotePubkey}`);
            process.exit(1);
        }
        remoteUser = u;
        remotePubkey = remoteUser.pubkey;
    } else {
        // Handle NIP-05 resolution for existing accounts
        if (remotePubkey.includes('@')) {
            const u = await NDKUser.fromNip05(remotePubkey);
            if (!u) {
                console.log(`Invalid nip05 ${remotePubkey}`);
                process.exit(1);
            }
            remoteUser = u;
            remotePubkey = remoteUser.pubkey;
        } else {
            remoteUser = new NDKUser({npub: remotePubkey});
        }
    }

    // Initialize local signer
    let localSigner: NDKPrivateKeySigner;
    const pk = loadPrivateKey();

    if (pk) {
        localSigner = new NDKPrivateKeySigner(pk);
    } else {
        localSigner = NDKPrivateKeySigner.generate();
        savePrivateKey(localSigner.privateKey!);
    }

    // Setup NIP-46 signer and NDK instance
    signer = new NDKNip46Signer(ndk, remoteUser.pubkey, localSigner);
    if (debug) console.log(`local pubkey`, (await localSigner.user()).npub);
    if (debug) console.log(`remote pubkey`, remotePubkey);
    ndk.signer = signer;

    // Handle OAuth-like authorization flow
    signer.on("authUrl", (url) => {
        console.log(`Go to ${url} to authorize this request`);
    });

    // Route to appropriate command handler
    switch (command) {
        case "sign": return signFlow();
        case "create_account": return createAccountFlow();
        default:
            console.log(`Unknown command ${command}`);
            process.exit(1);
    }
})();

/**
 * Handles account creation flow
 * Parses username, domain, and optional email
 * Creates new account through nsecBunker
 */
async function createAccountFlow() {
    const [ username, domain, email ] = content.split(',').map((s) => s.trim());
    try {
        const pubkey = await signer.createAccount(username, domain, email);
        const user = new NDKUser({pubkey});
        console.log(`Hello`, user.npub);
    } catch (e) {
        console.log('error', e);
    }
}

/**
 * Handles event signing flow
 * Supports both JSON event objects and simple text content
 * Optionally publishes signed events to relays
 */
function signFlow() {
    setTimeout(async () => {
        try {
            if (debug) console.log(`waiting for authorization (check your nsecBunker)...`);
            await signer.blockUntilReady();
        } catch(e) {
            console.log('error:', e);
            process.exit(1);
        }
        if (debug) console.log(`authorized to sign as`, remotePubkey);

        let event;

        // Parse event from JSON or create new kind:1 event
        try {
            const json = JSON.parse(content);
            event = new NDKEvent(ndk, json);
            if (!event.tags) { event.tags = []; }
            if (!event.content) { event.content = ""; }
            if (!event.kind) { throw "No kind on the event to sign!"; }
        } catch (e) {
            event = new NDKEvent(ndk, {
                kind: 1,
                content,
                tags: [
                    ['client', 'nsecbunker-client']
                ],
            } as NostrEvent);
        }

        // Sign and optionally publish event
        try {
            await event.sign();
            if (debug) {
                console.log(event.rawEvent());
            } else {
                console.log(event.sig);
            }

            if (!dontPublish) {
                const relaysPublished = await event.publish();
            }

            process.exit(0);
        } catch(e) {
            console.log('sign error', e);
        }
    }, 2000);
}
