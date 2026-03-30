/* global foundry, game */
import { EFFECT_FIELDS, BOOLEAN_TARGETS, getEffectGroupForTarget } from './effect-fields.js'

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
			height: 310
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

		context.currentGroup = getEffectGroupForTarget(system.target) || 'abilities'

		// Build group choices
		context.groupChoices = {}
		for (const [key, val] of Object.entries(EFFECT_FIELDS)) {
			context.groupChoices[key] = game.i18n.localize(val.label)
		}

		// Build field choices for current group
		const activeGroup = EFFECT_FIELDS[context.currentGroup]
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

		return context
	}

	_onRender(context, options) {
		super._onRender(context, options)
		const html = this.element

		const fieldSelect = html.querySelector('.effect-field-select')
		const groupSelect = html.querySelector('.effect-group-select')

		// Group dropdown change → update field dropdown
		groupSelect?.addEventListener('change', (e) => {
			e.stopPropagation()
			const groupKey = e.target.value
			const group = EFFECT_FIELDS[groupKey]
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
