/**
 * Profile Management Module
 * 
 * Handles user profile setup and management.
 * Features:
 * - Profile creation
 * - Relay configuration
 * - Profile encryption
 */

import NDK, { NDKEvent, NDKPrivateKeySigner, NostrEvent, type NDKUserProfile } from "@nostr-dev-kit/ndk";
import * as CryptoJS from 'crypto-js';
import createDebug from "debug";

const debug = createDebug("nsecbunker:profile");

/**
 * Default relay list for new profiles
 * Includes popular and reliable relays
 */
const explicitRelayUrls = [
    'wss://purplepag.es',
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    "wss://nostr.mutinywallet.com"
];

/**
 * Setup a skeleton profile for a new key since
 * the experience of a completely empty profile
 * is pretty bad when logging in with Coracle.
 *
 * @param email - if provided, will fetch the gravatar
 */
export async function setupSkeletonProfile(key: NDKPrivateKeySigner, profile?: NDKUserProfile, email?: string) {
    const rand = Math.random().toString(36).substring(7);
    profile ??= {};
    profile.display_name ??= 'New User via nsecBunker';
    profile.about ??= 'This is a skeleton profile. You should edit it.';
    profile.website ??= 'https://nsecbunker.com';
    profile.image ??= `https://robohash.org/${rand}?set=set5`;

    if (email) {
        try {
            const trimmedEmail = email.trim().toLowerCase();
            const hash = CryptoJS.MD5(trimmedEmail);
            const shash = hash.toString(CryptoJS.enc.Hex);
            profile.image = `https://robohash.org/${shash}?gravatar=hashed&set=set5`;
            debug('fetching gravatar', profile.image);
        } catch (e) {
            debug('error fetching gravatar', e);
        }
    }

    const user = await key.user();
    const ndk = new NDK({
        explicitRelayUrls,
        signer: key
    });

    await ndk.connect(2500);
    user.ndk = ndk;

    let event = new NDKEvent(ndk, {
        kind: 0,
        content: JSON.stringify(profile),
        pubkey: user.pubkey,
    } as NostrEvent);
    await event.sign(key);

    const t = await event.publish();
    debug(`Published to ${t.size} relays`);

    event = new NDKEvent(ndk, {
        kind: 3,
        tags: [
            ['p', 'fa984bd7dbb282f07e16e7ae87b26a2a7b9b90b7246a44771f0cf5ae58018f52'],
            ['p', user.pubkey],
        ],
        pubkey: user.pubkey,
    } as NostrEvent);
    await event.sign(key);
    debug(`follow list event`, event.rawEvent());
    await event.publish();

    const relays = new NDKEvent(ndk, {
        kind: 10002,
        tags: [
            ['r', 'wss://purplepag.es'],
            ['r', 'wss://relay.f7z.io'],
            ['r', 'wss://relay.damus.io'],
            ['r', 'wss://relayable.org'],
            ['r', 'wss://relay.nostr.band'],
            ['r', 'wss://relay.primal.net'],
        ],
        pubkey: user.pubkey,
    } as NostrEvent);
    await relays.sign(key);
    await relays.publish();
}