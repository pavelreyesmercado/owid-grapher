import { observable, computed } from "mobx"
import {
    defaultTo,
    formatValue,
    some,
    isString,
    formatDay,
    formatYear,
    last,
    sortBy,
    isNumber,
    sortedUniq
} from "./Util"
import { ChartDimension } from "./ChartDimension"
import { TickFormattingOptions } from "./TickFormattingOptions"
import { AbstractColumn } from "./owidData/OwidTable"

export class ChartDimensionWithOwidVariable {
    props: ChartDimension
    @observable.ref index: number

    @computed get variableId(): number {
        return this.props.variableId
    }

    @computed get property(): string {
        return this.props.property
    }

    @computed get displayName(): string {
        return defaultTo(
            defaultTo(this.props.display.name, this.column.display.name),
            this.column.name
        )
    }

    @computed get includeInTable(): boolean {
        return (
            this.property !== "color" &&
            (this.column.display.includeInTable ?? true)
        )
    }

    @computed get unit(): string {
        return defaultTo(
            defaultTo(this.props.display.unit, this.column.display.unit),
            this.column.unit
        )
    }

    // Full name of the variable with associated unit information, used for data export
    @computed get fullNameWithUnit(): string {
        return this.displayName + (this.unit ? ` (${this.unit})` : "")
    }

    @computed get unitConversionFactor(): number {
        return defaultTo(
            defaultTo(
                this.props.display.conversionFactor,
                this.column.display.conversionFactor
            ),
            1
        )
    }

    @computed get isProjection(): boolean {
        return !!defaultTo(
            this.props.display.isProjection,
            this.column.display.isProjection
        )
    }

    @computed get targetYear(): number | undefined {
        return this.props.targetYear
    }

    @computed get tolerance(): number {
        return defaultTo(
            defaultTo(
                this.props.display.tolerance,
                this.column.display.tolerance
            ),
            this.property === "color" ? Infinity : 0
        )
    }

    @computed get numDecimalPlaces(): number {
        return defaultTo(
            defaultTo(
                this.props.display.numDecimalPlaces,
                this.column.display.numDecimalPlaces
            ),
            2
        )
    }

    @computed get shortUnit(): string {
        const { unit } = this
        const shortUnit = defaultTo(
            defaultTo(
                this.props.display.shortUnit,
                this.column.display.shortUnit
            ),
            this.column.shortUnit || undefined
        )

        if (shortUnit !== undefined) return shortUnit

        if (!unit) return ""

        if (unit.length < 3) return unit
        else {
            const commonShortUnits = ["$", "£", "€", "%"]
            if (some(commonShortUnits, u => unit[0] === u)) return unit[0]
            else return ""
        }
    }

    @computed get formatValueShort(): (
        value: number | string,
        options?: TickFormattingOptions
    ) => string {
        const { shortUnit, numDecimalPlaces } = this
        return (value, options) => {
            if (isString(value)) return value
            else
                return formatValue(value, {
                    unit: shortUnit,
                    numDecimalPlaces,
                    ...options
                })
        }
    }

    @computed get formatValueLong(): (
        value: number | string,
        options?: TickFormattingOptions
    ) => string {
        const { unit, numDecimalPlaces } = this
        return (value, options) => {
            if (isString(value)) return value
            else
                return formatValue(value, {
                    unit: unit,
                    numDecimalPlaces: numDecimalPlaces,
                    ...options
                })
        }
    }

    @computed get formatYear(): (year: number) => string {
        return this.column.isDailyMeasurement
            ? (year: number) => formatDay(year)
            : formatYear
    }

    @computed get values() {
        const { unitConversionFactor } = this
        if (unitConversionFactor !== 1)
            return this.column.values.map(
                v => (v as number) * unitConversionFactor
            )
        else return this.column.values
    }

    @computed get sortedNumericValues(): number[] {
        return sortBy(this.values.filter(isNumber))
    }

    @computed get categoricalValues(): string[] {
        return sortedUniq(sortBy(this.values.filter(isString)))
    }

    get yearsUniq() {
        return sortedUniq(this.years)
    }

    get years() {
        return this.column.years
    }

    get entityNamesUniq() {
        return Array.from(this.column.entityNamesUniq)
    }

    get entityNames() {
        return this.column.entityNames
    }

    yearAndValueOfLatestValueforEntity(entity: string) {
        const valueByYear = this.valueByEntityAndYear.get(entity)
        return valueByYear ? last(Array.from(valueByYear)) ?? null : null
    }

    @computed get valueByEntityAndYear(): Map<
        string,
        Map<number, string | number>
    > {
        const valueByEntityAndYear = new Map<
            string,
            Map<number, string | number>
        >()
        for (let i = 0; i < this.values.length; i++) {
            const entity = this.entityNames[i]
            const year = this.years[i]
            const value = this.values[i]

            let valueByYear = valueByEntityAndYear.get(entity)
            if (!valueByYear) {
                valueByYear = new Map()
                valueByEntityAndYear.set(entity, valueByYear)
            }
            valueByYear.set(year, value)
        }
        return valueByEntityAndYear
    }

    @observable.ref column: AbstractColumn

    constructor(
        index: number,
        dimension: ChartDimension,
        column: AbstractColumn
    ) {
        this.index = index
        this.props = dimension
        this.column = column
    }
}
