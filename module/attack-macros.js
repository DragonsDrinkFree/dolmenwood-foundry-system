/* global game, ui, canvas, Macro */
/**
 * Attack Macro System
 * Creates and executes attack macros from the modifier panel's "save" button.
 */

import {
	performAttackRoll, getAttackModifiers,
	getApplicableMeleeModifiers, getApplicableMissileModifiers,
	isWeaponProficient, createUnarmedWeapon
} from './sheet/attack-rolls.js'
import { parseSaveLinks } from './chat-save.js'

/**
 * Create a Foundry Macro from the current modifier panel state and assign it to the hotbar.
 * @param {object} config - Attack configuration captured from the panel
 * @param {string} config.weaponName - Weapon name for runtime lookup
 * @param {string} config.weaponId - Weapon ID ('unarmed' for unarmed attacks)
 * @param {string} config.weaponImg - Weapon image path for the macro icon
 * @param {string} config.attackType - 'melee' or 'missile'
 * @param {string|null} config.attackMode - 'normal', 'charge', or 'push' (melee only)
 * @param {string[]} config.modifierIds - IDs of selected modifiers
 * @param {number} config.numericMod - Numeric modifier (-4 to +4)
 * @param {string|null} config.rollType - 'attack', 'damage', or null (both)
 * @param {number|null} config.rangeMod - Range modifier (missile only)
 * @param {string|null} config.rangeName - Range name for chat display (missile only)
 */
export async function createAttackMacro(config) {
	const macro = await Macro.create({
		name: `${game.i18n.localize('DOLMEN.Attack.Title')}: ${config.weaponName}`,
		type: 'script',
		img: config.weaponImg,
		command: 'game.dolmenwood.executeMacroAttack(this)',
		flags: { dolmenwood: { attackConfig: config } }
	})

	// Assign to first empty hotbar slot
	const hotbarMacros = game.user.getHotbarMacros()
	const emptySlot = hotbarMacros.find(entry => !entry.macro)
	if (emptySlot) {
		await game.user.assignHotbarMacro(macro, emptySlot.slot)
	}

	ui.notifications.info(game.i18n.format('DOLMEN.Attack.MacroCreated', { name: config.weaponName }))
}

/**
 * Execute an attack macro. Called by macro script: game.dolmenwood.executeMacroAttack(this)
 * @param {Macro} macro - The Foundry Macro document
 */
export async function executeMacroAttack(macro) {
	const config = macro.flags?.dolmenwood?.attackConfig
	if (!config) return

	// Resolve actor from saved ID, falling back to selected token or assigned character
	const actor = game.actors.get(config.actorId)
		|| canvas.tokens.controlled[0]?.actor
		|| game.user.character
	if (!actor) {
		ui.notifications.warn(game.i18n.localize('DOLMEN.Attack.MacroNoToken'))
		return
	}

	// Find weapon by name, or create unarmed pseudo-weapon
	let weapon
	if (config.weaponId === 'unarmed') {
		weapon = createUnarmedWeapon(actor)
	} else {
		weapon = actor.items.find(i => i.type === 'Weapon' && i.name === config.weaponName)
	}
	if (!weapon) {
		ui.notifications.warn(game.i18n.format('DOLMEN.Attack.MacroNoWeapon', { name: config.weaponName }))
		return
	}

	// Create shim to satisfy sheet.actor contract
	const sheet = { actor }

	// Resolve and validate modifiers at runtime
	const applicableModifiers = config.attackType === 'melee'
		? getApplicableMeleeModifiers(sheet, weapon)
		: getApplicableMissileModifiers(sheet, weapon)
	const savedIds = new Set(config.modifierIds || [])
	const selectedModifiers = applicableModifiers.filter(m => savedIds.has(m.id))

	// Recompute proficiency at runtime
	const proficient = isWeaponProficient(sheet, weapon)
	const rollType = config.rollType || null

	if (config.attackType === 'melee') {
		await executeMacroMelee(sheet, weapon, config.attackMode || 'normal', selectedModifiers, config.numericMod || 0, proficient, rollType)
	} else {
		await executeMacroMissile(sheet, weapon, selectedModifiers, config.numericMod || 0, proficient, rollType, config.rangeMod || 0, config.rangeName || null)
	}
}

/**
 * Execute a melee attack from macro config.
 * Mirrors executeMeleeAttack() in attack-rolls.js but takes a shim sheet.
 */
async function executeMacroMelee(sheet, weapon, attackMode, selectedModifiers, numericMod, proficient, rollType) {
	const attackModeBonus = attackMode === 'charge' ? 2 : attackMode === 'push' ? -4 : 0
	const proficiencyPenalty = proficient ? 0 : -4
	const isPush = attackMode === 'push'

	let modAttackBonus = 0
	let modDamageBonus = 0
	let damageOverride = null
	const modifierNames = []

	for (const mod of selectedModifiers) {
		modAttackBonus += mod.attackBonus || 0
		modDamageBonus += mod.damageBonus || 0
		if (mod.damageOverride) damageOverride = mod.damageOverride
		modifierNames.push(mod.name)
	}

	if (numericMod !== 0) {
		modifierNames.push(numericMod > 0 ? `+${numericMod}` : `${numericMod}`)
	}

	if (sheet.actor.system.exhaustion) {
		modifierNames.push(`<span title="${sheet.actor.system.exhaustion}">${game.i18n.localize('DOLMEN.Exhaustion')}</span>`)
	}

	const attackModeName = attackMode !== 'normal'
		? game.i18n.localize(`DOLMEN.Attack.Type.${attackMode.charAt(0).toUpperCase() + attackMode.slice(1)}`)
		: null

	const { totalMod } = getAttackModifiers(sheet, 'melee', weapon.system.weaponType)
	const weaponToHitBonus = weapon.system.toHitBonus || 0
	const finalAttackMod = totalMod + attackModeBonus + modAttackBonus + numericMod + proficiencyPenalty + weaponToHitBonus

	const exhaustion = sheet.actor.system.exhaustion || 0
	let damageFormula
	if (damageOverride) {
		damageFormula = damageOverride
	} else {
		damageFormula = weapon.system.damage
		const strMod = sheet.actor.system.final.abilities.strength.mod
		if (strMod !== 0) {
			damageFormula = strMod > 0
				? `${damageFormula} + ${strMod}`
				: `${damageFormula} - ${Math.abs(strMod)}`
		}
		if (modDamageBonus !== 0) {
			damageFormula = modDamageBonus > 0
				? `${damageFormula} + ${modDamageBonus}`
				: `${damageFormula} - ${Math.abs(modDamageBonus)}`
		}
		// Effect-based damage bonuses (general + melee-specific + weapon type)
		const wTypeDmg = sheet.actor.system.final.weaponTypeDamage?.[weapon.system.weaponType] || 0
		const effectDmgBonus = (sheet.actor.system.final.damage || 0) + (sheet.actor.system.final.damageMelee || 0) + wTypeDmg
		if (effectDmgBonus !== 0) {
			damageFormula = effectDmgBonus > 0
				? `${damageFormula} + ${effectDmgBonus}`
				: `${damageFormula} - ${Math.abs(effectDmgBonus)}`
		}
	}
	if (exhaustion !== 0) {
		damageFormula = `${damageFormula} - ${Math.abs(exhaustion)}`
	}

	const specialText = isPush
		? parseSaveLinks(`[${game.i18n.localize('DOLMEN.Attack.PushEffect')}](save:hold)`)
		: null

	await performAttackRoll(sheet, weapon, 'melee', {
		attackOnly: isPush || rollType === 'attack',
		damageOnly: !isPush && rollType === 'damage',
		totalAttackMod: finalAttackMod,
		damageFormula,
		modifierNames,
		attackModeName,
		specialText
	})
}

/**
 * Execute a missile attack from macro config.
 * Mirrors executeMissileAttack() in attack-rolls.js but takes a shim sheet.
 */
async function executeMacroMissile(sheet, weapon, selectedModifiers, numericMod, proficient, rollType, rangeMod, rangeName) {
	let modAttackBonus = 0
	let modDamageBonus = 0
	const modifierNames = []

	const proficiencyPenalty = proficient ? 0 : -4
	modAttackBonus += proficiencyPenalty

	for (const mod of selectedModifiers) {
		modAttackBonus += mod.attackBonus || 0
		modDamageBonus += mod.damageBonus || 0
		modifierNames.push(mod.name)
	}

	if (numericMod !== 0) {
		modifierNames.push(numericMod > 0 ? `+${numericMod}` : `${numericMod}`)
	}

	if (sheet.actor.system.exhaustion) {
		modifierNames.push(`<span title="${sheet.actor.system.exhaustion}">${game.i18n.localize('DOLMEN.Exhaustion')}</span>`)
	}

	const { totalMod } = getAttackModifiers(sheet, 'missile', weapon.system.weaponType)
	const weaponToHitBonus = weapon.system.toHitBonus || 0
	const finalAttackMod = totalMod + modAttackBonus + numericMod + rangeMod + weaponToHitBonus

	let damageFormula = weapon.system.damage
	if (modDamageBonus !== 0) {
		damageFormula = modDamageBonus > 0
			? `${damageFormula} + ${modDamageBonus}`
			: `${damageFormula} - ${Math.abs(modDamageBonus)}`
	}
	// Effect-based damage bonuses (general + missile-specific + weapon type)
	const wTypeDmg = sheet.actor.system.final.weaponTypeDamage?.[weapon.system.weaponType] || 0
	const effectDmgBonus = (sheet.actor.system.final.damage || 0) + (sheet.actor.system.final.damageMissile || 0) + wTypeDmg
	if (effectDmgBonus !== 0) {
		damageFormula = effectDmgBonus > 0
			? `${damageFormula} + ${effectDmgBonus}`
			: `${damageFormula} - ${Math.abs(effectDmgBonus)}`
	}
	const exhaustion = sheet.actor.system.exhaustion || 0
	if (exhaustion !== 0) {
		damageFormula = `${damageFormula} - ${Math.abs(exhaustion)}`
	}

	await performAttackRoll(sheet, weapon, 'missile', {
		attackOnly: rollType === 'attack',
		damageOnly: rollType === 'damage',
		totalAttackMod: finalAttackMod,
		damageFormula,
		modifierNames,
		attackModeName: rangeName
	})
}
