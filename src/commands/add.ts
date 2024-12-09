/**
 * Command to add a new encrypted nsec to the bunker
 * Handles:
 * - Prompting for passphrase and nsec
 * - Encrypting and storing the nsec in config
 * - Validation of provided nsec format
 */

import {nip19} from 'nostr-tools';
import readline from 'readline';
import { getCurrentConfig, saveCurrentConfig } from '../config/index.js';
import { encryptNsec } from '../config/keys.js';

interface IOpts {
    config: string;
    name: string;
}

export async function saveEncrypted(config: string, nsec: string, passphrase: string, name: string) {
    const { iv, data } = encryptNsec(nsec, passphrase);
    const currentConfig = await getCurrentConfig(config);

    currentConfig.keys[name] = { iv, data };

    saveCurrentConfig(config, currentConfig);
}

export async function addNsec(opts: IOpts) {
    const name = opts.name;
    const config = opts.config;

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log(`nsecBunker uses a passphrase to encrypt your nsec when stored on-disk.\n` +
                `Every time you restart it, you will need to type in this password.` +
                `\n`);

    rl.question(`Enter a passphrase: `, (passphrase: string) => {
        rl.question(`Enter the nsec for ${name}: `, (nsec: string) => {
            let decoded;
            try {
                decoded = nip19.decode(nsec);
                // const hexpubkey = getPublicKey(decoded.data as string);
                // const npub = nip19.npubEncode(hexpubkey);
                saveEncrypted(config, nsec, passphrase, name);

                rl.close();
            } catch (e: any) {
                console.log(e.message);
                process.exit(1);
            }
        });
    });
}
