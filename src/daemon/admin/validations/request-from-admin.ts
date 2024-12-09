/**
 * Admin Request Validation Module
 * 
 * Validates incoming requests to ensure they come from authorized administrators.
 * Handles:
 * - Pubkey validation
 * - Permission checking
 * - Request authentication
 */

import { NDKRpcRequest } from "@nostr-dev-kit/ndk";
import { nip19 } from "nostr-tools";

/**
 * Validates that a request comes from an authorized admin
 * @param req - The incoming RPC request
 * @param npubs - List of authorized admin npubs
 * @returns boolean indicating if request is valid
 */
export async function validateRequestFromAdmin(
    req: NDKRpcRequest,
    npubs: string[],
): Promise<boolean> {
    const hexpubkey = req.pubkey;

    if (!hexpubkey) {
        console.log('missing pubkey');
        return false;
    }

    // Convert npubs to hex format for comparison
    const hexpubkeys = npubs.map((npub) => nip19.decode(npub).data as string);

    return hexpubkeys.includes(hexpubkey);
}