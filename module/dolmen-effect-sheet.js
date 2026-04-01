/* global foundry, game, FilePicker */
import { BOOLEAN_TARGETS, getEffectGroupForTarget, getEffectFieldsForActor } from './effect-fields.js'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets

class DolmenEffectSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'sheet', 'item', 'effect'],
		tag: 'form',
		form: {
			submitOnChange: true
		},
		position: {
			width: 420,
			height: 'auto'
		},
		window: {
			resizable: true
		}
	}

	static PARTS = {
		body: {
			template: 'systems/dolmenwood/templates/items/parts/effect-body.html'
		}
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options)
		const system = this.item.system
		const actorType = this.item.parent?.type || 'Adventurer'
		const effectFields = getEffectFieldsForActor(actorType)

		context.currentGroup = getEffectGroupForTarget(system.target) || Object.keys(effectFields)[0]
		// Fall back to first available group if current group is excluded
		if (!effectFields[context.currentGroup]) {
			context.currentGroup = Object.keys(effectFields)[0]
		}

		// Build group choices
		context.groupChoices = {}
		for (const [key, val] of Object.entries(effectFields)) {
			context.groupChoices[key] = game.i18n.localize(val.label)
		}

		// Build field choices for current group
		const activeGroup = effectFields[context.currentGroup]
		context.fieldChoices = {}
		if (activeGroup) {
			for (const [key, label] of Object.entries(activeGroup.fields)) {
				context.fieldChoices[key] = game.i18n.localize(label)
			}
		}

		context.currentField = system.target
		context.isBoolean = BOOLEAN_TARGETS.has(system.target)
		context.system = system
		context.item = this.item

		// Duration choices
		context.durationChoices = {
			permanent: game.i18n.localize('DOLMEN.Effects.DurationPermanent'),
			rounds: game.i18n.localize('DOLMEN.Effects.DurationRounds'),
			turns: game.i18n.localize('DOLMEN.Effects.DurationTurns'),
			hours: game.i18n.localize('DOLMEN.Effects.DurationHours'),
			days: game.i18n.localize('DOLMEN.Effects.DurationDays'),
			untilRest: game.i18n.localize('DOLMEN.Effects.DurationUntilRest'),
			untilNextDay: game.i18n.localize('DOLMEN.Effects.DurationUntilNextDay')
		}
		context.hideDurationAmount = ['permanent', 'untilRest', 'untilNextDay'].includes(system.duration)

		return context
	}

	_onRender(context, options) {
		super._onRender(context, options)
		const html = this.element

		const portrait = html.querySelector('.portrait-image')
		if (portrait) {
			portrait.addEventListener('click', () => {
				new FilePicker({
					type: 'image',
					current: this.item.img,
					callback: (path) => this.item.update({ img: path })
				}).browse()
			})
		}

		const fieldSelect = html.querySelector('.effect-field-select')
		const groupSelect = html.querySelector('.effect-group-select')

		// Group dropdown change → update field dropdown
		const actorType = this.item.parent?.type || 'Adventurer'
		const effectFields = getEffectFieldsForActor(actorType)
		groupSelect?.addEventListener('change', (e) => {
			e.stopPropagation()
			const groupKey = e.target.value
			const group = effectFields[groupKey]
			if (!group || !fieldSelect) return

			fieldSelect.innerHTML = ''
			for (const [key, label] of Object.entries(group.fields)) {
				const opt = document.createElement('option')
				opt.value = key
				opt.textContent = game.i18n.localize(label)
				fieldSelect.appendChild(opt)
			}

			const firstField = Object.keys(group.fields)[0]
			this._updateBooleanState(html, firstField)

			fieldSelect.dispatchEvent(new Event('change', { bubbles: true }))
		})

		// Field dropdown change → auto-detect boolean
		fieldSelect?.addEventListener('change', () => {
			this._updateBooleanState(html, fieldSelect.value)
		})

		// Duration dropdown change → show/hide amount field
		const durationSelect = html.querySelector('.effect-duration-select')
		durationSelect?.addEventListener('change', (e) => {
			const valueRow = html.querySelector('.effect-duration-value-row')
			const noAmount = ['permanent', 'untilRest', 'untilNextDay'].includes(e.target.value)
			if (valueRow) valueRow.style.display = noAmount ? 'none' : ''
		})
	}

	_updateBooleanState(html, target) {
		const isBoolean = BOOLEAN_TARGETS.has(target)
		const valueRow = html.querySelector('.effect-value-row')
		if (valueRow) valueRow.style.display = isBoolean ? 'none' : ''
		const typeInput = html.querySelector('input[name="system.effectType"]')
		if (typeInput) typeInput.value = isBoolean ? 'boolean' : 'numeric'
	}
}

export default DolmenEffectSheet
