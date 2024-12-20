import { Hexpubkey, NDKEvent, NostrEvent } from "@nostr-dev-kit/ndk";
import type { Backend } from "./backend";
import prisma from "../db";
import type { Request } from "@prisma/client";
import AdminInterface from "./admin";
import { IConfig } from "../config";

let baseUrl: string | undefined | null;

/**
 * Attempts to contact an admin to approve this request.
 *
 * @param admin - The admin interface instance to handle authorization
 * @param keyName - Optional identifier for the key being authorized
 * @param remotePubkey - The public key of the remote party requesting authorization
 * @param requestId - Unique identifier for this authorization request
 * @param method - The method being requested
 * @param param - Optional parameters for the request, can be a string or NDKEvent
 * @returns Promise resolving to a string when authorization is complete
 * @throws Will reject if authorization is denied
 */
export async function requestAuthorization(
    admin: AdminInterface,
    keyName: string | undefined,
    remotePubkey: Hexpubkey,
    requestId: string,
    method: string,
    param?: string | NDKEvent
) {
    const request = await createRecord(keyName, requestId, remotePubkey, method, param);

    if (baseUrl === undefined) {
        const config = await admin.config();
        baseUrl = config.baseUrl;
        console.log('baseUrl', baseUrl);
    }

    return new Promise<string>((resolve, reject) => {
        if (baseUrl) {
            // If we have a URL, request authorization through web
            urlAuthFlow(baseUrl, admin, remotePubkey, requestId, request, resolve, reject);
        } else {
            adminAuthFlow(admin, keyName, remotePubkey, method, param, resolve, reject);
        }
    });
}

/**
 * Handles the authorization flow when communicating directly with an admin
 *
 * @param adminInterface - The admin interface instance
 * @param keyName - Optional identifier for the key being authorized
 * @param remotePubkey - The public key of the remote party
 * @param method - The method being requested
 * @param param - Optional parameters for the request
 * @param resolve - Promise resolution callback
 * @param reject - Promise rejection callback
 */
async function adminAuthFlow(adminInterface, keyName, remotePubkey, method, param, resolve, reject) {
    const requestedPerm = await adminInterface.requestPermission(keyName, remotePubkey, method, param);

    if (requestedPerm) {
        console.log('resolve adminAuthFlow', !!requestedPerm);
        resolve();
    } else {
        console.log('reject adminAuthFlow', !!requestedPerm);
        reject();
    }
}

/**
 * Creates a database record for the authorization request
 *
 * @param keyName - Optional identifier for the key being authorized
 * @param requestId - Unique identifier for this authorization request
 * @param remotePubkey - The public key of the remote party
 * @param method - The method being requested
 * @param param - Optional parameters for the request
 * @returns The created request record
 */
async function createRecord(
    keyName: string | undefined,
    requestId: string,
    remotePubkey: string,
    method: string,
    param?: string | NDKEvent,
) {
    let params: string | undefined;

    if (param?.rawEvent) {
        const e = param as NDKEvent;
        params = JSON.stringify(e.rawEvent());
    } else if (param) {
        params = param.toString();
    }

    // Create an authorization request record
    const request = await prisma.request.create({
        data: {
            keyName,
            requestId,
            remotePubkey,
            method,
            params
        }
    });
    // Attempt to clean it when it expires
    setTimeout(() => { prisma.request.delete({ where: { id: request.id }}); }, 60000);

    return request;
}

/**
 * Handles the authorization flow when using a web-based approval process
 *
 * @param baseUrl - Base URL for the authorization endpoint
 * @param admin - The admin interface instance
 * @param remotePubkey - The public key of the remote party
 * @param requestId - Unique identifier for this authorization request
 * @param request - The request record from the database
 * @param resolve - Promise resolution callback
 * @param reject - Promise rejection callback
 */
export function urlAuthFlow(
    baseUrl: string,
    admin: AdminInterface,
    remotePubkey: Hexpubkey,
    requestId: string,
    request: Request,
    resolve: any,
    reject: any
) {
    const url = generatePendingAuthUrl(baseUrl, request);

    admin.rpc.sendResponse(requestId, remotePubkey, "auth_url", undefined, url);

    // Regularly poll to see if this request was approved so we can synchronously resolve
    // the caller. This will feel a bit like magical, where a connection request is created,
    // a popup is opened, the user approves the application, and when the popup closes, the
    // calling function has automatically been approved
    const checkingInterval = setInterval(async () => {
        const record = await prisma.request.findUnique({
            where: { id: request.id }
        });

        if (!record) {
            clearInterval(checkingInterval);
            return;
        }

        if (record.allowed !== undefined && record.allowed !== null) {
            clearInterval(checkingInterval);

            if (record.allowed === false) {
                reject(record.payload);
            }
            console.log('resolve urlAuthFlow', !!record.params);
            resolve(record.params);
        }
    }, 100);
}

/**
 * Generates the URL for a pending authorization request
 *
 * @param baseUrl - Base URL for the authorization endpoint
 * @param request - The request record from the database
 * @returns The complete URL for the authorization request
 */
function generatePendingAuthUrl(baseUrl: string, request: Request): string {
    return [
        baseUrl,
        'requests',
        request.id
    ].join('/');
}