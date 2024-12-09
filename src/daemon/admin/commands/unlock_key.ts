import { NDKRpcRequest } from "@nostr-dev-kit/ndk";
import AdminInterface from "../index.js";

/**
 * Handles key unlocking requests for the admin interface.
 * 
 * @param {AdminInterface} admin - The admin interface instance handling the request
 * @param {NDKRpcRequest} req - The RPC request containing the key name and passphrase
 * @returns {Promise<void>} A promise that resolves when the response is sent
 * @throws {Error} If params are invalid or unlockKey method is not available
 */
export default async function unlockKey(admin: AdminInterface, req: NDKRpcRequest) {
    const [ keyName, passphrase ] = req.params as [ string, string ];

    if (!keyName || !passphrase) throw new Error("Invalid params");
    if (!admin.unlockKey) throw new Error("No unlockKey method");

    let result;

    try {
        const res = await admin.unlockKey(keyName, passphrase);
        result = JSON.stringify({ success: res });
    } catch (e: any) {
        result = JSON.stringify({ success: false, error: e.message });
    }

    return admin.rpc.sendResponse(req.id, req.pubkey, result, 24134);
}