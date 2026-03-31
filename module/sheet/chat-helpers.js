/* global game, ChatMessage */

/**
 * Create a chat message respecting the current roll mode setting.
 * Applies whisper/blind flags based on the core rollMode dropdown.
 * IMPORTANT: For blind rolls to work, pass evaluated Roll objects in `rolls` array.
 * @param {object} messageData - Data passed to ChatMessage.create()
 * @returns {Promise<ChatMessage>}
 */
export async function createChatMessage(messageData) {
	const rollMode = game.settings.get('core', 'rollMode')
	if (rollMode !== 'publicroll') {
		delete messageData.style
	}
	ChatMessage.applyRollMode(messageData, rollMode)
	return ChatMessage.create(messageData)
}
