/* global CONFIG, foundry */

/**
 * Dolmenwood implementation of Foundry's core CalendarData.
 * Weeks restart each month: days 1-28 are four 7-day weeks; days 29-31
 * are wysendays, which sit outside the week and are represented as an
 * 8th pseudo-weekday (index 7).
 */
export class DolmenwoodCalendar extends foundry.data.CalendarData {
	/** @override */
	timeToComponents(time = 0) {
		const components = super.timeToComponents(time)
		components.dayOfWeek = components.dayOfMonth < 28 ? components.dayOfMonth % 7 : 7
		return components
	}
}

/**
 * Build the core CalendarConfig for game.time.calendar from CONFIG.DOLMENWOOD,
 * so third-party modules can read the in-world date via the standard API.
 * Name fields hold i18n keys, matching core's own calendar configuration.
 */
export function buildCalendarConfig() {
	const { BASE_YEAR, DAYS_PER_YEAR, months, seasons, weekDays } = CONFIG.DOLMENWOOD
	const monthKeys = Object.keys(months)

	const dayValues = weekDays.map((key, i) => ({
		name: `DOLMEN.Calendar.WeekDays.${key}`,
		abbreviation: `DOLMEN.Calendar.WeekDaysShort.${key}`,
		ordinal: i + 1
	}))
	dayValues.push({ name: 'DOLMEN.Calendar.Wysenday', ordinal: 8 })

	return {
		name: 'DOLMEN.Calendar.CalendarName',
		years: {
			yearZero: BASE_YEAR,
			firstWeekday: 0,
			leapYear: null
		},
		months: {
			values: monthKeys.map((key, i) => ({
				name: `DOLMEN.Months.${key}`,
				ordinal: i + 1,
				days: months[key].days
			}))
		},
		days: {
			values: dayValues,
			daysPerYear: DAYS_PER_YEAR,
			hoursPerDay: 24,
			minutesPerHour: 60,
			secondsPerMinute: 60
		},
		seasons: {
			values: Object.entries(seasons).map(([key, season]) => ({
				name: `DOLMEN.Calendar.Seasons.${key}`,
				monthStart: monthKeys.indexOf(season.months[0]) + 1,
				monthEnd: monthKeys.indexOf(season.months[season.months.length - 1]) + 1
			}))
		}
	}
}
