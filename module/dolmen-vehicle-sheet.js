/* global foundry, game, FilePicker, Item */

import { buildChoices, CHOICE_KEYS } from './utils/choices.js'
import { prepareItemData, groupItemsByType } from './sheet/data-context.js'
import { setupAdjustableInputListeners } from './sheet/listeners.js'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets

class DolmenVehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: ['dolmen', 'sheet', 'creature', 'vehicle'],
		tag: 'form',
		form: {
			submitOnChange: true
		},
		position: {
			width: 700,
			height: 550,
		},
		window: {
			resizable: true
		},
		actions: {
			openItem: DolmenVehicleSheet._onOpenItem,
			deleteItem: DolmenVehicleSheet._onDeleteItem,
			increaseQty: DolmenVehicleSheet._onIncreaseQty,
			decreaseQty: DolmenVehicleSheet._onDecreaseQty,
			toggleContainer: DolmenVehicleSheet._onToggleContainer
		}
	}

	static PARTS = {
		tabs: {
			template: 'systems/dolmenwood/templates/vehicle/parts/tab-nav.html'
		},
		stats: {
			template: 'systems/dolmenwood/templates/vehicle/parts/tab-stats.html',
			scrollable: ['']
		},
		inventory: {
			template: 'systems/dolmenwood/templates/vehicle/parts/tab-inventory.html',
			scrollable: ['']
		},
		description: {
			template: 'systems/dolmenwood/templates/vehicle/parts/tab-description.html',
			scrollable: ['']
		}
	}

	static TABS = {
		primary: {
			tabs: [
				{ id: 'stats', icon: 'fas fa-wagon-covered', label: 'DOLMEN.Tabs.Stats' },
				{ id: 'inventory', icon: 'fas fa-box', label: 'DOLMEN.Tabs.Inventory' },
				{ id: 'description', icon: 'fas fa-book-open', label: 'DOLMEN.Tabs.Description' }
			],
			initial: 'stats'
		}
	}

	tabGroups = {
		primary: 'stats'
	}

	_getTabs() {
		const tabs = {}
		for (const [groupId, config] of Object.entries(this.constructor.TABS)) {
			const group = {}
			for (const t of config.tabs) {
				group[t.id] = {
					id: t.id,
					group: groupId,
					icon: t.icon,
					label: game.i18n.localize(t.label),
					active: this.tabGroups[groupId] === t.id,
					cssClass: this.tabGroups[groupId] === t.id ? 'active' : ''
				}
			}
			tabs[groupId] = group
		}
		return tabs
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options)
		const actor = this.actor

		context.actor = actor
		context.system = actor.system
		context.tabs = this._getTabs()

		// Dropdown choices
		context.vehicleTypeChoices = buildChoices('DOLMEN.Vehicle.Types', CHOICE_KEYS.vehicleTypes)
		context.costDenomChoices = buildChoices('DOLMEN.Item.Denomination', CHOICE_KEYS.costDenominations)

		// Crew/Animals label depends on vehicle type
		const isLand = actor.system.vehicleType === 'land'
		context.isLand = isLand
		context.crewAnimalsLabel = isLand
			? game.i18n.localize('DOLMEN.Vehicle.Animals')
			: game.i18n.localize('DOLMEN.Vehicle.Crew')
		context.crewAnimalsPlaceholder = isLand
			? game.i18n.localize('DOLMEN.Vehicle.AnimalsPlaceholder')
			: game.i18n.localize('DOLMEN.Vehicle.CrewPlaceholder')
		if (isLand) {
			context.animalCountChoices = buildChoices('DOLMEN.Vehicle.AnimalCounts', CHOICE_KEYS.animalCounts)
		} else {
			context.crewPercentChoices = buildChoices('DOLMEN.Vehicle.CrewPercents', CHOICE_KEYS.crewPercents)
		}

		// Speed adjustment: HP damage (all vehicles) + crew % (water/air only)
		// Each 10% missing HP or crew reduces speed by that percentage, additive
		const hpMax = actor.system.hp.max || 1
		const hpValue = actor.system.hp.value || 0
		const hpPenalty = (1 - Math.floor(Math.min(hpValue / hpMax, 1) * 10) / 10) * 100

		let crewPenalty = 0
		if (!isLand) {
			crewPenalty = 100 - (parseInt(actor.system.crewPercent) || 100)
		}

		const totalPenalty = Math.min(hpPenalty + crewPenalty, 100)
		context.baseSpeed = actor.system.speed
		context.adjustedSpeed = Math.max(0, Math.round(actor.system.speed * (1 - totalPenalty / 100)))
		context.speedHasAdj = context.baseSpeed !== context.adjustedSpeed

		// Encumbrance method
		const encumbranceMethod = game.settings.get('dolmenwood', 'encumbranceMethod')
		context.encumbranceMethod = encumbranceMethod
		const isSlots = encumbranceMethod === 'slots'
		const divisor = isSlots ? 100 : 1
		const cargoMultiplier = (isLand && actor.system.animalCount === 'double') ? 2 : 1
		context.cargoCapacity = (actor.system.cargo / divisor) * cargoMultiplier
		context.cargoDisplay = actor.system.cargo / divisor
		context.cargoDivisor = divisor
		context.cargoUnit = isSlots
			? game.i18n.localize('DOLMEN.Encumbrance.UnitSlots')
			: game.i18n.localize('DOLMEN.Encumbrance.UnitCoins')

		// Passengers (1 passenger = 5000 coins / 50 slots)
		const passengerWeight = isSlots ? 50 : 5000
		context.passengerWeight = (actor.system.passengers || 0) * passengerWeight

		// Prepare inventory data
		this._prepareInventoryContext(context, actor)

		// Load status (include passenger weight)
		const currentLoad = (context.currentLoad || 0) + context.passengerWeight
		context.totalLoad = currentLoad
		context.overloaded = context.cargoCapacity > 0 && currentLoad > context.cargoCapacity

		return context
	}

	_prepareInventoryContext(context, actor) {
		const isSlots = context.encumbranceMethod === 'slots'
		const weightKey = isSlots ? 'weightSlots' : 'weightCoins'

		const excludedTypes = ['Kindred', 'Class', 'Spell', 'HolySpell', 'Glamour', 'Rune']
		const items = actor.items.contents.filter(i => !excludedTypes.includes(i.type))
		const allStowedItems = items.filter(i => i.type !== 'Container').map(i => prepareItemData(i))

		// Build container data
		const containerItems = items.filter(i => i.type === 'Container')
		context.containers = containerItems.map(c => {
			const prepared = prepareItemData(c)
			const contents = allStowedItems.filter(i => i.system.containerId === c.id)
			const coinsUsed = contents.reduce((sum, i) => sum + (i.system[weightKey] || 0) * (i.system.quantity || 1), 0)
			return {
				...prepared,
				contents: groupItemsByType(contents),
				hasContents: contents.length > 0,
				coinsUsed,
				coinsMax: c.system.capacityCoins
			}
		})
		context.hasContainers = context.containers.length > 0

		// Loose stowed items (not in any container)
		const containerIds = new Set(containerItems.map(c => c.id))
		const looseStowedItems = allStowedItems.filter(i => !i.system.containerId || !containerIds.has(i.system.containerId))

		context.stowedByType = groupItemsByType(looseStowedItems)
		context.hasLooseStowedItems = looseStowedItems.length > 0
		const itemWeight = looseStowedItems.reduce((sum, i) => sum + (i.system[weightKey] || 0) * (i.system.quantity || 1), 0)
		const totalCoins = (actor.system.coins.copper || 0) + (actor.system.coins.silver || 0)
			+ (actor.system.coins.gold || 0) + (actor.system.coins.pellucidium || 0)
		const coinsWeight = isSlots ? Math.ceil(totalCoins / 100) : totalCoins
		context.unsortedWeight = itemWeight + coinsWeight
		context.hasStowedItems = context.hasLooseStowedItems || context.hasContainers

		// Total load: items in containers + loose items + coins
		const containerWeight = context.containers.reduce((sum, c) => sum + c.coinsUsed, 0)
		context.currentLoad = containerWeight + itemWeight + coinsWeight

		// Cargo overweight indicator
		if (context.cargoCapacity && context.unsortedWeight > context.cargoCapacity) {
			context.cargoOverweight = true
		}
	}

	async _preparePartContext(partId, context) {
		context = await super._preparePartContext(partId, context)
		const tabIds = ['stats', 'inventory', 'description']
		if (tabIds.includes(partId)) {
			context.tab = context.tabs?.primary?.[partId] || {
				id: partId,
				cssClass: this.tabGroups.primary === partId ? 'active' : ''
			}
		}
		if (partId === 'description') {
			context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
				this.actor.system.description || '', { async: true, secrets: game.user.isGM }
			)
		}
		return context
	}

	_onChangeTab(tabId, group) {
		this.tabGroups[group] = tabId
		this.render()
	}

	/* -------------------------------------------- */
	/*  Event Listeners                             */
	/* -------------------------------------------- */

	_onRender(context, options) {
		super._onRender(context, options)

		// Adjustable input listeners (speed with crew % penalty)
		setupAdjustableInputListeners(this)

		// Tab listeners
		this.element.querySelectorAll('.tabs .item').forEach(tab => {
			tab.addEventListener('click', (event) => {
				event.preventDefault()
				const { tab: tabId, group } = event.currentTarget.dataset
				this._onChangeTab(tabId, group)
			})
		})

		// Portrait picker
		const portrait = this.element.querySelector('.portrait-image')
		if (portrait) {
			portrait.addEventListener('click', () => {
				new FilePicker({
					type: 'image',
					current: this.actor.img,
					callback: (path) => this.actor.update({ img: path })
				}).browse()
			})
		}

		// Cargo display ↔ hidden coins conversion
		this.element.querySelectorAll('.load-display').forEach(input => {
			input.addEventListener('change', (event) => {
				event.preventDefault()
				event.stopPropagation()
				const divisor = parseInt(input.dataset.divisor) || 1
				const target = input.dataset.target
				const coinsValue = Math.round(parseFloat(input.value) * divisor)
				const hidden = this.element.querySelector(`input[name="${target}"]`)
				if (hidden) {
					hidden.value = coinsValue
					hidden.dispatchEvent(new Event('change', { bubbles: true }))
				}
			})
		})

		// Drag & drop for inventory items
		this.element.querySelectorAll('.item-row.draggable').forEach(el => {
			el.setAttribute('draggable', true)
			el.addEventListener('dragstart', (event) => {
				const itemId = el.dataset.itemId
				const item = this.actor.items.get(itemId)
				if (!item) return
				event.dataTransfer.setData('text/plain', JSON.stringify({
					type: 'Item',
					uuid: item.uuid
				}))
			})
		})
	}

	/* -------------------------------------------- */
	/*  Drag & Drop                                 */
	/* -------------------------------------------- */

	async _onDropItem(event, data) {
		const item = await Item.implementation.fromDropData(data)
		if (!item) return

		// Only allow gear-type items on vehicles
		const allowedTypes = ['Item', 'Weapon', 'Armor', 'Treasure', 'Foraged', 'Container']
		if (!allowedTypes.includes(item.type)) return

		// Check if dropping into a container
		const containerEl = event.target?.closest('.container-group[data-container-id]')
		const containerId = containerEl?.dataset?.containerId || ''

		// If item belongs to this actor, just move it to the container
		if (item.parent?.id === this.actor.id) {
			return item.update({ 'system.containerId': containerId })
		}

		// Create a new embedded item
		const itemData = item.toObject()
		itemData.system.equipped = false
		if (containerId) itemData.system.containerId = containerId
		return this.actor.createEmbeddedDocuments('Item', [itemData])
	}

	/* -------------------------------------------- */
	/*  Static Action Handlers                      */
	/* -------------------------------------------- */

	static _onOpenItem(_event, target) {
		const itemId = target.dataset.itemId ?? target.closest('[data-item-id]')?.dataset.itemId
		if (!itemId) return
		const item = this.actor.items.get(itemId)
		item?.sheet?.render(true)
	}

	static _onDeleteItem(_event, target) {
		const itemId = target.dataset.itemId ?? target.closest('[data-item-id]')?.dataset.itemId
		if (!itemId) return
		const item = this.actor.items.get(itemId)
		item?.delete()
	}

	static _onIncreaseQty(_event, target) {
		const itemId = target.dataset.itemId ?? target.closest('[data-item-id]')?.dataset.itemId
		if (!itemId) return
		const item = this.actor.items.get(itemId)
		if (item) item.update({ 'system.quantity': (item.system.quantity || 1) + 1 })
	}

	static _onDecreaseQty(_event, target) {
		const itemId = target.dataset.itemId ?? target.closest('[data-item-id]')?.dataset.itemId
		if (!itemId) return
		const item = this.actor.items.get(itemId)
		if (item && item.system.quantity > 1) item.update({ 'system.quantity': item.system.quantity - 1 })
	}

	static _onToggleContainer(_event, target) {
		const group = target.closest('.container-group')
		if (group) group.classList.toggle('collapsed')
	}
}

export default DolmenVehicleSheet
