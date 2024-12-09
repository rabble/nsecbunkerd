import { Hexpubkey, NDKKind, NDKPrivateKeySigner, NDKRpcRequest, NDKUserProfile } from "@nostr-dev-kit/ndk";
import AdminInterface from "..";
import { nip19 } from 'nostr-tools';
import { setupSkeletonProfile } from "../../lib/profile";
import { IConfig, getCurrentConfig, saveCurrentConfig } from "../../../config";
import { readFileSync, writeFileSync } from "fs";
import { allowAllRequestsFromKey } from "../../lib/acl";
import { requestAuthorization } from "../../authorize";
import { generateWallet } from "./account/wallet";
import prisma from "../../../db";
import createDebug from "debug";

const debug = createDebug("nsecbunker:createAccount");

/**
 * Account Creation Command Handler
 * 
 * Handles the creation of new user accounts.
 * Features:
 * - Key generation
 * - Initial permissions setup
 * - Profile creation
 */

/**
 * Validates the creation of a new nostr account by checking:
 * 1. Username is provided
 * 2. Domain exists in config
 * 3. Username isn't already taken in the domain's nip05 file
 */
export async function validate(currentConfig, username: string, domain: string, email?: string) {
    if (!username) {
        throw new Error('username is required');
    }

    // make sure we have the domain
    if (!currentConfig.domains[domain]) {
        throw new Error('domain not found');
    }

    // load the current nip05 for the domain
    const nip05s = await getCurrentNip05File(currentConfig, domain);

    if (nip05s.names[username]) {
        throw new Error('username already exists');
    }
}

const emptyNip05File = {
    names: {},
    relays: {},
}

/**
 * Retrieves the current NIP-05 verification file for a domain
 * NIP-05 files map usernames to their corresponding nostr public keys
 * and contain relay information for the domain
 */
async function getCurrentNip05File(currentConfig: any, domain: string) {
    try {
        const nip05File = currentConfig.domains[domain].nip05;
        const file = readFileSync(nip05File, 'utf8');
        return JSON.parse(file);
    } catch (e: any) {
        return emptyNip05File;
    }
}

/**
 * Updates the domain's NIP-05 file with a new username->pubkey mapping
 * Also adds relay information for NIP-46 (Nostr Connect) support
 */
async function addNip05(currentConfig: IConfig, username: string, domain: string, pubkey: Hexpubkey) {
    const currentNip05s = await getCurrentNip05File(currentConfig, domain);
    currentNip05s.names[username] = pubkey;
    currentNip05s.relays ??= {};
    currentNip05s.nip46 ??= {};
    currentNip05s.nip46[pubkey] = currentConfig.nostr.relays;

    // save file
    const nip05File = currentConfig.domains![domain].nip05;
    writeFileSync(nip05File, JSON.stringify(currentNip05s, null, 2));
}

/**
 * Reserved usernames that cannot be used since someone might
 * confuse them with some type of authority of this domain
 * and scammers are scoundrels
 */
const RESERVED_USERNAMES = [
    "admin", "root", "_", "administrator", "__"
];

async function validateUsername(username: string | undefined, domain: string, admin: AdminInterface, req: NDKRpcRequest) {
    if (!username || username.length === 0) {
        // create a random username of 10 characters
        username = Math.random().toString(36).substring(2, 15);
    }

    // check if the username is available
    if (RESERVED_USERNAMES.includes(username)) {
        throw new Error('username not available');
    }

    return username;
}

async function validateDomain(domain: string | undefined, admin: AdminInterface, req: NDKRpcRequest) {
    const availableDomains = (await admin.config()).domains;

    if (!availableDomains || Object.keys(availableDomains).length === 0)
        throw new Error('no domains available');

    if (!domain || domain.length === 0) domain = Object.keys(availableDomains)[0];

    // check if the domain is available
    if (!availableDomains[domain]) {
        throw new Error('domain not available');
    }

    return domain;
}

/**
 * Main entry point for account creation
 * 1. Validates username and domain
 * 2. Requests authorization for the creation
 * 3. If authorized, calls createAccountReal to perform the actual creation
 */
export default async function createAccount(admin: AdminInterface, req: NDKRpcRequest) {
    let [ username, domain, email ] = req.params as [ string?, string?, string? ];

    try {
        domain = await validateDomain(domain, admin, req);
        username = await validateUsername(username, domain, admin, req);
    } catch (e: any) {
        const originalKind = req.event.kind!;
        admin.rpc.sendResponse(req.id, req.pubkey, "error", originalKind, e.message);
        return;
    }

    const nip05 = `${username}@${domain}`;
    const payload: string[] = [ username, domain ];
    if (email) payload.push(email);

    debug(`Requesting authorization for ${nip05}`);
    const authorizationWithPayload = await requestAuthorization(
        admin,
        nip05,
        req.pubkey,
        req.id,
        req.method,
        JSON.stringify(payload)
    );
    debug(`Authorization for ${nip05} ${authorizationWithPayload ? 'granted' : 'denied'}`);

    if (authorizationWithPayload) {
        const payload = JSON.parse(authorizationWithPayload);
        username = payload[0];
        domain = payload[1];
        email = payload[2];
        return createAccountReal(admin, req, username, domain, email);
    }
}

/**
 * Performs the actual account creation after authorization:
 * 1. Generates a new key pair for the user
 * 2. Creates and saves NIP-05 verification
 * 3. Sets up a lightning wallet if configured
 * 4. Creates initial nostr profile
 * 5. Saves the private key in the bunker's config
 * 6. Grants initial permissions to the requesting client
 * 
 * @param admin - The admin interface for managing the bunker
 * @param req - The original RPC request
 * @param username - Validated username
 * @param domain - Validated domain
 * @param email - Optional email for the account
 */
export async function createAccountReal(
    admin: AdminInterface,
    req: NDKRpcRequest,
    username: string,
    domain: string,
    email?: string
) {
    try {
        const currentConfig = await getCurrentConfig(admin.configFile);

        if (!currentConfig.domains) {
            throw new Error('no domains configured');
        }

        const domainConfig = currentConfig.domains[domain];

        await validate(currentConfig, username, domain, email);

        const nip05 = `${username}@${domain}`;
        const key = NDKPrivateKeySigner.generate();
        const profile: NDKUserProfile = {
            display_name: username,
            name: username,
            nip05,
            ...(domainConfig.defaultProfile || {})
        };

        const generatedUser = await key.user();

        debug(`Created user ${generatedUser.npub} for ${nip05}`);

        // Add NIP-05
        await addNip05(currentConfig, username, domain, generatedUser.pubkey);

        debug(`Added NIP-05 for ${nip05}`);

        // Create wallet
        if (domainConfig.wallet) {
            generateWallet(
                domainConfig.wallet,
                username, domain, generatedUser.npub
            ).then((lnaddress) => {
                debug(`wallet for ${nip05}`, {lnaddress});
                if (lnaddress) profile.lud16 = lnaddress;
            }).catch((e) => {
                debug(`error generating wallet for ${nip05}`, e);
            }).finally(() => {
                debug(`saving profile for ${nip05}`, profile);
                setupSkeletonProfile(key, profile, email);
            })
        } else {
            debug(`no wallet configuration for ${domain}`);
            // Create user profile
            setupSkeletonProfile(key, profile, email);
        }

        const keyName = nip05;
        const nsec = nip19.nsecEncode(key.privateKey!);
        currentConfig.keys[keyName] = { key: key.privateKey };

        saveCurrentConfig(admin.configFile, currentConfig);

        await admin.loadNsec!(keyName, nsec);

        await prisma.key.create({ data: { keyName, pubkey: generatedUser.pubkey } });

        // Immediately grant access to the creator key
        // This means that the client creating this account can immediately
        // access it without having to go through an approval flow
        await grantPermissions(req, keyName);

        return admin.rpc.sendResponse(req.id, req.pubkey, generatedUser.pubkey, NDKKind.NostrConnectAdmin);
    } catch (e: any) {
        console.trace('error', e);
        return admin.rpc.sendResponse(req.id, req.pubkey, "error", NDKKind.NostrConnectAdmin,
            e.message);
    }
}

/**
 * Grants initial permissions to the key that created the account
 * Allows for:
 * - Nostr Connect authentication
 * - Signing events (all kinds)
 * - Encryption/decryption operations
 */
async function grantPermissions(req: NDKRpcRequest, keyName: string) {
    await allowAllRequestsFromKey(req.pubkey, keyName, "connect");
    await allowAllRequestsFromKey(req.pubkey, keyName, "sign_event", undefined, undefined, { kind: 'all' });
    await allowAllRequestsFromKey(req.pubkey, keyName, "encrypt");
    await allowAllRequestsFromKey(req.pubkey, keyName, "decrypt");
}