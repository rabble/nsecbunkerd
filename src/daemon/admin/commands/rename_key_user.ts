/**
 * Key User Rename Command Handler
 * 
 * Manages the renaming of key users.
 * Features:
 * - User description updates
 * - Key association management
 */

import { NDKRpcRequest } from "@nostr-dev-kit/ndk";
import AdminInterface from "../index.js";
import prisma from "../../../db.js";

/**
 * Updates the description for a key user
 * @param admin - Admin interface instance
 * @param req - The RPC request containing new name
 * @returns Response indicating success
 */
export default async function renameKeyUser(admin: AdminInterface, req: NDKRpcRequest) {
    const [ keyUserId, description ] = req.params as [ string, string ];

    if (!keyUserId || !description) throw new Error("Invalid params");

    const keyUserIdInt = parseInt(keyUserId);
    if (isNaN(keyUserIdInt)) throw new Error("Invalid params");

    // Update user description
    await prisma.keyUser.update({
        where: {
            id: keyUserIdInt,
        },
        data: {
            description,
        }
    });

    const result = JSON.stringify(["ok"]);
    return admin.rpc.sendResponse(req.id, req.pubkey, result, 24134);
}
