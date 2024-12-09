/**
 * Direct Message Utility
 * 
 * Handles sending encrypted direct messages to users via Nostr.
 * Supports both npub and NDKUser recipients.
 */

import NDK, { NDKUser, NDKEvent, NostrEvent } from "@nostr-dev-kit/ndk";

/**
 * Sends an encrypted direct message to a user
 * @param ndk - NDK instance for sending messages
 * @param recipient - Target user (npub string or NDKUser)
 * @param content - Message content to send
 * @returns The sent NDKEvent
 */
export async function dmUser(ndk: NDK, recipient: NDKUser | string, content: string): Promise<NDKEvent> {
    let targetUser;

    // Convert string recipient to NDKUser if needed
    if (typeof recipient === 'string') {
        targetUser = new NDKUser({ npub: recipient });
    } else if (recipient instanceof NDKUser) {
        targetUser = recipient;
    }

    // Create and encrypt the event
    const event = new NDKEvent(ndk, { kind: 4, content } as NostrEvent);
    event.tag(targetUser);
    await event.encrypt(targetUser);
    await event.sign();
    
    // Attempt to publish
    try {
        await event.publish();
    } catch (e) {
        console.log(e);
    }

    return event;
}
