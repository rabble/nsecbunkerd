import { NDKEvent, NostrEvent } from '@nostr-dev-kit/ndk';
import prisma from '../../../db.js';

/**
 * Access Control List Implementation
 * 
 * This module handles permission management and request validation.
 * Features:
 * - Method-specific permissions
 * - Event kind filtering
 * - Token-based access control
 * - User permission management
 */

export async function checkIfPubkeyAllowed(
    keyName: string,
    remotePubkey: string,
    method: IMethod,
    payload?: string | NostrEvent
): Promise<boolean | undefined> {
    // find KeyUser
    const keyUser = await prisma.keyUser.findUnique({
        where: { unique_key_user: { keyName, userPubkey: remotePubkey } },
    });

    if (!keyUser) {
        return undefined;
    }

    // find SigningCondition
    const signingConditionQuery = requestToSigningConditionQuery(method, payload);

    const explicitReject = await prisma.signingCondition.findFirst({
        where: {
            keyUserId: keyUser.id,
            method: '*',
            allowed: false,
        }
    });

    if (explicitReject) {
        console.log(`explicit reject`, explicitReject);
        return false;
    }

    const signingCondition = await prisma.signingCondition.findFirst({
        where: {
            keyUserId: keyUser.id,
            ...signingConditionQuery,
        }
    });

    // if no SigningCondition found, return undefined
    if (!signingCondition) {
        return undefined;
    }

    const allowed = signingCondition.allowed;

    // Check if the key user has been revoked
    if (allowed) {
        const revoked = await prisma.keyUser.findFirst({
            where: {
                id: keyUser.id,
                revokedAt: { not: null },
            }
        });

        if (revoked) {
            return false;
        }
    }

    if (allowed === true || allowed === false) {
        console.log(`found signing condition`, signingCondition);
        return allowed;
    }

    return undefined;
}

export type IMethod = "connect" | "sign_event" | "encrypt" | "decrypt" | "ping";

export type IAllowScope = {
    kind?: number | 'all';
};

/**
 * Converts a request into a signing condition query
 * Handles special cases for different methods, especially sign_event
 * @param method - The requested method
 * @param payload - Optional payload or NostrEvent
 */
export function requestToSigningConditionQuery(method: IMethod, payload?: string | NostrEvent) {
    const signingConditionQuery: any = { method };

    switch (method) {
        case 'sign_event':
            signingConditionQuery.kind = { in: [ payload?.kind?.toString(), 'all' ] };
            break;
    }

    return signingConditionQuery;
}

/**
 * Converts an allow scope into a signing condition query
 * Used for creating new permissions
 * @param method - The method to allow
 * @param scope - Optional scope restrictions
 */
export function allowScopeToSigningConditionQuery(method: string, scope?: IAllowScope) {
    const signingConditionQuery: any = { method };

    if (scope && scope.kind) {
        signingConditionQuery.kind = scope.kind.toString();
    }

    return signingConditionQuery;
}

/**
 * Grants permissions to a key for specific methods
 * Creates or updates user record and signing conditions
 * @param remotePubkey - The public key to grant permissions to
 * @param keyName - The key name to grant permissions for
 * @param method - The method to allow
 * @param param - Optional parameters
 * @param description - Optional user description
 * @param allowScope - Optional scope restrictions
 */
export async function allowAllRequestsFromKey(
    remotePubkey: string,
    keyName: string,
    method: string,
    param?: any,
    description?: string,
    allowScope?: IAllowScope,
): Promise<void> {
    try {
        // Upsert the KeyUser record
        const upsertedUser = await prisma.keyUser.upsert({
            where: { unique_key_user: { keyName, userPubkey: remotePubkey } },
            update: { },
            create: { keyName, userPubkey: remotePubkey, description },
        });

        // Create signing condition
        const signingConditionQuery = allowScopeToSigningConditionQuery(method, allowScope);
        await prisma.signingCondition.create({
            data: {
                allowed: true,
                keyUserId: upsertedUser.id,
                ...signingConditionQuery,
                ...allowScope
            },
        });
    } catch (e) {
        console.log('allowAllRequestsFromKey', e);
    }
}

export async function rejectAllRequestsFromKey(remotePubkey: string, keyName: string): Promise<void> {
    // Upsert the KeyUser with the given remotePubkey
    const upsertedUser = await prisma.keyUser.upsert({
        where: { unique_key_user: { keyName, userPubkey: remotePubkey } },
        update: { },
        create: { keyName, userPubkey: remotePubkey },
    });

    // Create a new SigningCondition for the given KeyUser and set allowed to false
    await prisma.signingCondition.create({
        data: {
            allowed: false,
            keyUserId: upsertedUser.id,
        },
    });
}