/**
 * Token Creation Command Handler
 * 
 * Manages the creation of access tokens.
 * Features:
 * - Token generation
 * - Policy association
 * - Expiration management
 * - Client tracking
 */

import { NDKRpcRequest } from "@nostr-dev-kit/ndk";
import AdminInterface from "../index.js";
import prisma from "../../../db.js";

/**
 * Creates a new access token with associated policy
 * @param admin - Admin interface instance
 * @param req - The RPC request containing token details
 * @returns Response indicating success
 */
export default async function createNewToken(admin: AdminInterface, req: NDKRpcRequest) {
    const [ keyName, clientName, policyId, durationInHours ] = req.params as [ string, string, string, string? ];

    if (!clientName || !policyId) throw new Error("Invalid params");

    // Validate policy exists
    const policy = await prisma.policy.findUnique({ 
        where: { id: parseInt(policyId) }, 
        include: { rules: true } 
    });

    if (!policy) throw new Error("Policy not found");

    console.log({clientName, policy, durationInHours});

    // Generate random token
    const token = [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    
    // Prepare token data
    const data: any = {
        keyName, 
        clientName, 
        policyId,
        createdBy: req.pubkey,
        token
    };

    // Add expiration if duration specified
    if (durationInHours) {
        data.expiresAt = new Date(Date.now() + (parseInt(durationInHours) * 60 * 60 * 1000));
    }

    // Create token record
    const tokenRecord = await prisma.token.create({data});

    if (!tokenRecord) throw new Error("Token not created");

    const result = JSON.stringify(["ok"]);
    return admin.rpc.sendResponse(req.id, req.pubkey, result, 24134);
}