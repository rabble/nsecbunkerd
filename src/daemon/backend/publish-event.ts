import { NDKNip46Backend } from "@nostr-dev-kit/ndk";
import { IEventHandlingStrategy } from '@nostr-dev-kit/ndk';

/**
 * Strategy for handling event publication requests in a Nostr NIP-46 backend.
 * Implements the IEventHandlingStrategy interface for processing publish commands.
 */
export default class PublishEventHandlingStrategy implements IEventHandlingStrategy {
    /**
     * Handles the publication of a Nostr event.
     * @param backend - The NIP-46 backend instance handling the request
     * @param id - The request identifier
     * @param remotePubkey - The public key of the remote client
     * @param params - Array of parameters for the event creation
     * @returns A promise that resolves to the stringified Nostr event or undefined if signing fails
     */
    async handle(backend: NDKNip46Backend, id: string, remotePubkey: string, params: string[]): Promise<string|undefined> {
        const event = await backend.signEvent(remotePubkey, params);
        if (!event) return undefined;

        console.log('Publishing event', event);
        await event.publish();

        return JSON.stringify(await event.toNostrEvent());
    }
}
