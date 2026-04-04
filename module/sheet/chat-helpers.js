/* global game, ChatMessage */

/**
 * Create a chat message respecting the current roll mode setting.
 * Applies whisper/blind flags based on the core rollMode dropdown.
 * IMPORTANT: For blind rolls to work, pass evaluated Roll objects in `rolls` array.
 * @param {object} messageData - Data passed to ChatMessage.create()
 * @returns {Promise<ChatMessage>}
 */
export async function createChatMessage(messageData) {
	const messageMode = game.settings.get('core', 'messageMode')
	if (messageMode !== 'publicroll') {
		delete messageData.style
	}
	const applyMode = ChatMessage.applyMode ?? ChatMessage.applyRollMode
	applyMode(messageData, messageMode)
	return ChatMessage.create(messageData)
}
