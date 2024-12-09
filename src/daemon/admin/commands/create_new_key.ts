import NDK, { NDKEvent, NDKPrivateKeySigner, NDKRpcRequest, type NostrEvent } from "@nostr-dev-kit/ndk";
import AdminInterface from "../index.js";
import { saveEncrypted } from "../../../commands/add.js";
import { nip19 } from 'nostr-tools';
import { setupSkeletonProfile } from "../../lib/profile.js";

/**
 * Creates a new Nostr key or imports an existing one, saves it encrypted, and sets up a basic profile
 * @param {AdminInterface} admin - The admin interface instance handling the request
 * @param {NDKRpcRequest} req - The RPC request containing the parameters
 * @returns {Promise<void>} - Returns the RPC response with the new npub
 * @throws {Error} If required parameters are missing or if unlockKey method is not available
 */
export default async function createNewKey(admin: AdminInterface, req: NDKRpcRequest) {
    // Extract parameters: keyName (for storage), passphrase (for encryption), and optional nsec (existing key)
    const [ keyName, passphrase, _nsec ] = req.params as [ string, string, string? ];

    // Validate required parameters
    if (!keyName || !passphrase) throw new Error("Invalid params");
    if (!admin.loadNsec) throw new Error("No unlockKey method");

    let key;

    if (_nsec) {
        // Import existing key from nsec
        key = new NDKPrivateKeySigner(nip19.decode(_nsec).data as string);
    } else {
        // Generate new key pair
        key = NDKPrivateKeySigner.generate();

        // Create basic profile for new key
        setupSkeletonProfile(key);
        console.log(`setting up skeleton profile for ${keyName}`);
    }

    // Get user information and encode private key
    const user = await key.user();
    const nsec = nip19.nsecEncode(key.privateKey!);

    // Save the encrypted key to config
    await saveEncrypted(
        admin.configFile,
        nsec,
        passphrase,
        keyName
    );

    // Load the key into active use
    await admin.loadNsec(keyName, nsec);

    // Prepare and send response with public key
    const result = JSON.stringify({
        npub: user.npub,
    });

    return admin.rpc.sendResponse(req.id, req.pubkey, result, 24134);
}
