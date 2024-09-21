import NDK, { NDKNip46Backend, NDKPrivateKeySigner, Nip46PermitCallback } from '@nostr-dev-kit/ndk';
import prisma from '../../db.js';
import type {FastifyInstance} from "fastify";

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

    async applyToken(userPubkey: string, token: string): Promise<void> {
        const tokenRecord = await this.validateToken(token);
        const keyName = tokenRecord.keyName;

        // Upsert the KeyUser with the given remotePubkey
        const upsertedUser = await prisma.keyUser.upsert({
            where: { unique_key_user: { keyName, userPubkey } },
            update: { },
            create: { keyName, userPubkey, description: tokenRecord.clientName },
        });

        await prisma.signingCondition.create({
            data: {
                keyUserId: upsertedUser.id,
                method: 'connect',
                allowed: true,
            }
        });

        // Go through the rules of this policy and apply them to the user
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

        await prisma.token.update({
            where: { id: tokenRecord.id },
            data: {
                redeemedAt: new Date(),
                keyUserId: upsertedUser.id,
            }
        });
    }

}
