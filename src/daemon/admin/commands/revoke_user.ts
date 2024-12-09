/**
 * User Revocation Command Handler
 * 
 * Manages the revocation of user access.
 * Features:
 * - User access revocation
 * - Timestamp tracking
 * - Permission removal
 */

import { NDKRpcRequest } from "@nostr-dev-kit/ndk";
import AdminInterface from "../index.js";
import prisma from "../../../db.js";

/**
 * Revokes access for a specific user
 * @param admin - Admin interface instance
 * @param req - The RPC request containing user ID
 * @returns Response indicating success
 */
export default async function revokeUser(admin: AdminInterface, req: NDKRpcRequest) {
    const [ keyUserId ] = req.params as [ string ];

    if (!keyUserId) throw new Error("Invalid params");

    const keyUserIdInt = parseInt(keyUserId);
    if (isNaN(keyUserIdInt)) throw new Error("Invalid params");

    // Update user record with revocation timestamp
    await prisma.keyUser.update({
        where: {
            id: keyUserIdInt,
        },
        data: {
            revokedAt: new Date(),
        }
    });

    const result = JSON.stringify(["ok"]);
    return admin.rpc.sendResponse(req.id, req.pubkey, result, 24134);
}
