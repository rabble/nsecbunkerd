/**
 * Policy Creation Command Handler
 * 
 * Manages the creation of new access policies.
 * Features:
 * - Policy naming and expiration
 * - Rule creation and management
 * - Usage tracking setup
 */

import { NDKRpcRequest } from "@nostr-dev-kit/ndk";
import AdminInterface from "../index.js";
import prisma from "../../../db.js";

/**
 * Creates a new access policy with associated rules
 * @param admin - Admin interface instance
 * @param req - The RPC request containing policy details
 * @returns Response indicating success
 */
export default async function createNewPolicy(admin: AdminInterface, req: NDKRpcRequest) {
    const [ _policy ] = req.params as [ string ];

    if (!_policy) throw new Error("Invalid params");

    const policy = JSON.parse(_policy);

    // Create the base policy record
    const policyRecord = await prisma.policy.create({
        data: {
            name: policy.name,
            expiresAt: policy.expires_at,
        }
    });

    // Create associated rules
    for (const rule of policy.rules) {
        await prisma.policyRule.create({
            data: {
                policyId: policyRecord.id,
                kind: rule.kind.toString(),
                method: rule.method,
                maxUsageCount: rule.use_count,
                currentUsageCount: 0,
            }
        });
    }

    const result = JSON.stringify(["ok"]);
    return admin.rpc.sendResponse(req.id, req.pubkey, result, 24134);
}