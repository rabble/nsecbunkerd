import NDK, { NDKNip46Backend, NDKPrivateKeySigner, Nip46PermitCallback } from '@nostr-dev-kit/ndk';
import prisma from '../../db.js';
import type {FastifyInstance} from "fastify";

/**
 * Backend Service Implementation
 * 
 * This file implements the core backend functionality for the nsecBunker service.
 * It handles:
 * - Token validation and application
 * - User authentication
 * - Permission management
 * - Integration with NDK (Nostr Development Kit)
 */

export class Backend extends NDKNip46Backend {
    public baseUrl?: string;
    public fastify: FastifyInstance;

    constructor(
        ndk: NDK,
        fastify: FastifyInstance,
        key: string,
        cb: Nip46PermitCallback,
        baseUrl?: string
    ) {
        const signer = new NDKPrivateKeySigner(key);
        super(ndk, signer, cb);

        this.baseUrl = baseUrl;
        this.fastify = fastify;

        // this.setStrategy('publish_event', new PublishEventHandlingStrategy());
    }

    private async validateToken(token: string) {
        if (!token) throw new Error("Invalid token");

        const tokenRecord = await prisma.token.findUnique({ where: {
            token
        }, include: { policy: { include: { rules: true } } } });

        if (!tokenRecord) throw new Error("Token not found");
        if (tokenRecord.redeemedAt) throw new Error("Token already redeemed");
        if (!tokenRecord.policy) throw new Error("Policy not found");
        if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) throw new Error("Token expired");

        return tokenRecord;
    }

    /**
     * Applies a token to a user, setting up their permissions
     * Flow:
     * 1. Validates the provided token
     * 2. Creates or updates user record
     * 3. Sets up basic connection permissions
     * 4. Applies policy rules from token
     * 
     * @param userPubkey - The user's public key
     * @param token - The token to apply
     */
    async applyToken(userPubkey: string, token: string): Promise<void> {
        const tokenRecord = await this.validateToken(token);
        const keyName = tokenRecord.keyName;

        // Create or update user record
        const upsertedUser = await prisma.keyUser.upsert({
            where: { unique_key_user: { keyName, userPubkey } },
            update: { },
            create: { keyName, userPubkey, description: tokenRecord.clientName },
        });

        // Set up basic connect permission
        await prisma.signingCondition.create({
            data: {
                keyUserId: upsertedUser.id,
                method: 'connect',
                allowed: true,
            }
        });

        // Apply policy rules
        for (const rule of tokenRecord!.policy!.rules) {
            const signingConditionQuery: any = { method: rule.method };

            if (rule && rule.kind) {
                signingConditionQuery.kind = rule.kind.toString();
            }

            await prisma.signingCondition.create({
                data: {
                    keyUserId: upsertedUser.id,
                    method: rule.method,
                    allowed: true,
                    ...signingConditionQuery,
                }
            });
        }

        // Update token status
        await prisma.token.update({
            where: { id: tokenRecord.id },
            data: {
                redeemedAt: new Date(),
                keyUserId: upsertedUser.id,
            }
        });
    }

}
