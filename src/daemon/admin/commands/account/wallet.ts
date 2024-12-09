/**
 * Wallet management functionality for user accounts.
 * Handles wallet generation and LN Address creation through LNBits integration.
 */

import axios from "axios";
import createDebug from "debug";
import { IWalletConfig, LNBitsWalletConfig } from "../../../../config";

const debug = createDebug("nsecbunker:wallet");

/**
 * Generates a wallet based on the provided configuration.
 * Currently supports LNBits wallet generation.
 * 
 * @param walletConfig - Wallet configuration object
 * @param username - User's username
 * @param domain - Domain name
 * @param npub - User's nostr public key
 * @returns Lightning address in the format username@domain
 */
export async function generateWallet(
    walletConfig: IWalletConfig,
    username: string,
    domain: string,
    npub: string
) {
    debug("generateWallet", walletConfig, username, domain, npub);
    if (walletConfig.lnbits) {
        return generateLNBitsWallet(walletConfig.lnbits, username, domain, npub);
    }
}

/**
 * Creates a new wallet in LNBits for the specified user.
 * 
 * @param lnbitsConfig - LNBits-specific configuration
 * @param username - User's username
 * @param domain - Domain name
 * @param npub - User's nostr public key
 * @returns Lightning address in the format username@domain
 * @throws Will throw an error if the LNBits API request fails
 */
export async function generateLNBitsWallet(
    lnbitsConfig: LNBitsWalletConfig,
    username: string,
    domain: string,
    npub: string
) {
    debug("generateLNBitsWallet", lnbitsConfig, username, domain, npub);

    const url = new URL(lnbitsConfig.url);
    url.pathname = '/usermanager/api/v1/users';

    const res = await axios.post(url.toString(), {
        user_name: username,
        wallet_name: `${username}@${domain}`,
    }, {
        headers: {
            "X-Api-Key": lnbitsConfig.key,
        },
    });

    const user = res.data;
    const wallet = user.wallets[0];

    debug("lnbits response: ", {status: res.status, data: res.data});

    return await generateLNAddress(
        username,
        domain,
        wallet.inkey,
        npub,
        'lnbits',
        lnbitsConfig.url,
        lnbitsConfig.nostdressUrl,
    );
}

/**
 * Generates a Lightning Address by registering with a nostdress server.
 * 
 * @param username - User's username
 * @param domain - Domain name
 * @param userInvoiceKey - LNBits invoice/read key
 * @param userNpub - User's nostr public key
 * @param kind - Type of Lightning implementation (e.g., 'lnbits')
 * @param host - Base URL of the Lightning implementation
 * @param nostdressUrl - URL of the nostdress server
 * @returns Lightning address in the format username@domain
 * @throws Will throw an error if the nostdress API request fails
 */
export async function generateLNAddress(
    username: string,
    domain: string,
    userInvoiceKey: string,
    userNpub: string,
    kind: string,
    host: string,
    nostdressUrl: string
) {
    debug("generateLNAddress", username, domain, userInvoiceKey, userNpub, kind, host, nostdressUrl);
    const formData = new URLSearchParams();
    formData.append('name', username);
    formData.append('domain', domain);
    formData.append('kind', kind);
    formData.append('host', host);
    formData.append('key', userInvoiceKey);
    formData.append('pin', ' ');
    formData.append('npub', userNpub);
    formData.append('currentName', ' ');

    const url = new URL(nostdressUrl);
    url.pathname = '/api/easy/';

    debug("nostdress urL: ", url.toString());

    const res = await axios.post(url.toString(), formData, {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    debug("nostdress response: ", res.data);

    return `${username}@${domain}`;
}