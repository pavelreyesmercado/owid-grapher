import {
    OwidVariable,
    OwidVariableDisplaySettings,
    EntityMeta,
    OwidVariablesAndEntityKey
} from "./OwidVariable"
import {
    slugify,
    groupBy,
    computeRollingAverage,
    insertMissingValuePlaceholders,
    diffDateISOStringInDays
} from "charts/Util"
import { max, min, flatten, sortedUniq } from "lodash"
import { computed, action, observable } from "mobx"
import { OwidSource } from "./OwidSource"
import { EPOCH_DATE } from "settings"
import { csvParse } from "d3-dsv"

declare type int = number
declare type year = int
declare type columnSlug = string // let's be very restrictive on valid column names to start.

interface Row {
    [columnName: string]: any
}

// Todo: replace with someone else's library
const computeRollingAveragesForEachGroup = (
    rows: Row[],
    valueAccessor: (row: Row) => any,
    groupColName: string,
    dateColName: string,
    rollingAverage: number
) => {
    const groups: number[][] = []
    let currentGroup = rows[0][groupColName]
    let currentRows: Row[] = []
    // Assumes items are sorted by entity
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const groupName = row && row[groupColName]
        if (currentGroup !== groupName) {
            const averages = computeRollingAverage(
                insertMissingValuePlaceholders(
                    currentRows.map(valueAccessor),
                    currentRows.map(row => row[dateColName])
                ),
                rollingAverage
            ).filter(value => value !== null) as number[]
            groups.push(averages)
            if (!row) break
            currentRows = []
            currentGroup = groupName
        }
        currentRows.push(row)
    }
    return flatten(groups)
}

interface OwidRow extends Row {
    entityName: string
    entityCode: string
    entityId: number
    year?: year
    day?: int
    date?: string
}

export interface ColumnSpec {
    slug: columnSlug
    name?: string
    owidVariableId?: int
    unit?: string
    shortUnit?: string
    isDailyMeasurement?: boolean
    description?: string
    coverage?: string
    datasetId?: string
    datasetName?: string
    source?: OwidSource
    display?: OwidVariableDisplaySettings

    // More advanced options:
    isFilterColumn?: boolean
    annotationsColumnSlug?: columnSlug
}

// todo: remove index param?
export declare type RowToValueMapper = (row: Row, index?: int) => any

export interface ComputedColumnSpec extends ColumnSpec {
    fn: RowToValueMapper
}

export abstract class AbstractColumn {
    spec: ColumnSpec
    table: AbstractTable<Row>

    constructor(table: AbstractTable<Row>, spec: ColumnSpec) {
        this.table = table
        this.spec = spec
    }

    @computed get isDailyMeasurement() {
        return !!this.spec.isDailyMeasurement
    }

    @computed get unit() {
        return this.spec.unit || ""
    }

    @computed get shortUnit() {
        return this.spec.shortUnit || ""
    }

    @computed get display() {
        return this.spec.display || new OwidVariableDisplaySettings()
    }

    @computed get coverage() {
        return this.spec.coverage
    }

    @computed private get annotationsMap() {
        if (!this.spec.annotationsColumnSlug) return undefined
        const column = this.table.columnsBySlug.get(
            this.spec.annotationsColumnSlug
        )
        return column ? column.entityMap : undefined
    }

    getAnnotationsFor(entityName: string) {
        const map = this.annotationsMap
        return map ? map.get(entityName) : undefined
    }

    @computed get entityMap() {
        const map = new Map<string, any>()
        const slug = this.slug
        this.rows.forEach(row => map.set(row.entityName, row[slug]))
        return map
    }

    @computed get description() {
        return this.spec.description
    }

    @computed get datasetName() {
        return this.spec.datasetName
    }

    @computed get source() {
        return this.spec.source
    }

    @computed get datasetId() {
        return this.spec.datasetId
    }

    @computed get name() {
        return this.spec.name ?? this.spec.slug
    }

    @computed get slug() {
        return this.spec.slug
    }

    // todo: remove
    @computed get entityNames() {
        return this.rows.map(row => row.entityName)
    }

    // todo: remove
    @computed get entityNamesUniq() {
        return new Set(this.entityNames)
    }

    // todo: remove
    @computed get years() {
        return this.rows.map(row => (row.year ?? row.day)!)
    }

    // todo: remove
    @computed get valuesUniq() {
        return sortedUniq(this.values)
    }

    @computed private get rows() {
        const slug = this.spec.slug
        return this.table.unfilteredRows.filter(row => row[slug] !== undefined)
    }

    @computed get values() {
        const slug = this.spec.slug
        return this.rows.map(row => row[slug])
    }
}

class AnyColumn extends AbstractColumn {}
class BooleanColumn extends AbstractColumn {}
// Todo: Add NumberColumn, AbstractTemporalColumn, DayColumn, YearColumn, EntityColumn, etc

declare type ColumnSpecs = Map<columnSlug, ColumnSpec>

abstract class AbstractTable<ROW_TYPE extends Row> {
    @observable.ref rows: ROW_TYPE[]
    @observable protected columns: Map<columnSlug, AbstractColumn> = new Map()

    constructor(rows: ROW_TYPE[], columnSpecs?: ColumnSpecs) {
        this.rows = rows
        if (!columnSpecs) this.detectAndAddColumnsFromRows(rows)
        else
            Array.from(columnSpecs.keys()).forEach(slug => {
                this.columns.set(
                    slug,
                    new AnyColumn(this, columnSpecs.get(slug)!)
                )
            })
    }

    protected detectAndAddColumnsFromRows(rows: Row[]) {
        const specs = AbstractTable.makeSpecsFromRows(this.rows)
        const cols = this.columns
        Array.from(specs.keys()).forEach(slug => {
            // At the moment do not overwrite existing columns
            if (!cols.has(slug))
                cols.set(slug, new AnyColumn(this, specs.get(slug)!))
        })
    }

    static makeSpecsFromRows(rows: any[]): ColumnSpecs {
        const map = new Map()
        rows.forEach(row => {
            Object.keys(row).forEach(key => {
                map.set(key, { slug: key })
            })
        })
        return map
    }

    @action.bound deleteColumnBySlug(slug: columnSlug) {
        this.rows.forEach(row => delete row[slug])
        this.columnNames.delete(slug)
    }

    @action.bound addFilterColumn(
        slug: columnSlug,
        predicate: (row: Row) => boolean
    ) {
        return this._addComputedColumn(
            { slug, isFilterColumn: true, fn: predicate },
            BooleanColumn
        )
    }

    private _addComputedColumn(
        spec: ComputedColumnSpec,
        columnType = AnyColumn
    ) {
        const slug = spec.slug
        this.columns.set(slug, new columnType(this, spec))
        const fn = spec.fn
        this.rows.forEach((row, index) => {
            ;(row as any)[slug] = fn(row, index)
        })
    }

    @action.bound addColumnSpec(spec: ColumnSpec) {
        this.columns.set(spec.slug, new AnyColumn(this, spec))
        return this
    }

    @action.bound addComputedColumn(spec: ComputedColumnSpec) {
        return this._addComputedColumn(spec)
    }

    // todo: this won't work when adding rows dynamically
    @action.bound addRollingAverageColumn(
        spec: ColumnSpec,
        windowSize: int,
        valueAccessor: (row: Row) => any,
        dateColName: columnSlug,
        groupBy: columnSlug
    ) {
        const averages = computeRollingAveragesForEachGroup(
            this.rows,
            valueAccessor,
            groupBy,
            dateColName,
            windowSize
        )
        this._addComputedColumn({
            ...spec,
            fn: (row, index) => (row[spec.slug] = averages[index!])
        })
    }

    @computed get columnsBySlug() {
        return this.columns
    }

    @computed get columnsByName() {
        const map = new Map<string, AbstractColumn>()
        this.columns.forEach(col => {
            map.set(col.name, col)
        })
        return map
    }

    @computed get columnNames() {
        return new Set(Array.from(this.columns.values()).map(col => col.name))
    }

    @computed get unfilteredRows() {
        const slugs = this.filterColumnSlugs
        const filterFns = slugs.map(
            slug =>
                (this.columnsBySlug.get(slug)!.spec as ComputedColumnSpec).fn
        )
        const filterFn = (row: Row) =>
            slugs.every((slug, index) => {
                if (row[slug] === undefined) row[slug] = filterFns[index](row)
                return row[slug]
            })
        return slugs.length ? this.rows.filter(filterFn) : this.rows
    }

    @computed private get filterColumnSlugs() {
        return this.columnsAsArray
            .filter(col => col.spec.isFilterColumn)
            .map(col => col.slug)
    }

    @computed private get columnsAsArray() {
        return Array.from(this.columns.values())
    }

    // for debugging
    rowsWith(query: string) {
        const cols = Array.from(this.columnNames)
        return this.rows.filter(row =>
            cols
                .map(cName => cName + " " + (row[cName] ?? ""))
                .join(" ")
                .includes(query)
        )
    }

    toDelimited(delimiter = ",", rowLimit?: number) {
        const cols = Array.from(this.columnNames)
        const header = cols.join(delimiter) + "\n"
        const rows = rowLimit ? this.rows.slice(0, rowLimit) : this.rows
        const body = rows
            .map(row => cols.map(cName => row[cName] ?? "").join(delimiter))
            .join("\n")
        return header + body
    }

    @action.bound addRowsAndDetectColumns(rows: ROW_TYPE[]) {
        this.rows = this.rows.concat(rows)
        this.detectAndAddColumnsFromRows(rows)
        return this
    }
}

export class BasicTable extends AbstractTable<Row> {
    static fromCsv(csv: string) {
        return new BasicTable(csvParse(csv))
    }
}

export class OwidTable extends AbstractTable<OwidRow> {
    @computed get columnsByOwidVarId() {
        const map = new Map<number, AbstractColumn>()
        Array.from(this.columns.values()).forEach((column, index) => {
            map.set(column.spec.owidVariableId ?? index, column)
        })
        return map
    }

    @computed get availableEntities() {
        return Array.from(new Set(this.rows.map(row => row.entityName)))
    }

    // todo: can we remove at some point?
    @computed get entityIdToNameMap() {
        const map = new Map()
        this.rows.forEach(row => {
            map.set(row.entityId, row.entityName)
        })
        return map
    }

    // todo: can we remove at some point?
    @computed get entityNameToIdMap() {
        const map = new Map()
        this.rows.forEach(row => {
            map.set(row.entityName, row.entityId)
        })
        return map
    }

    // todo: can we remove at some point?
    @computed get entityNameToCodeMap() {
        const map = new Map()
        this.rows.forEach(row => {
            map.set(row.entityName, row.entityCode)
        })
        return map
    }

    @computed get maxYear() {
        return max(this.allYears)
    }

    @computed get minYear() {
        return min(this.allYears)
    }

    @computed get allYears() {
        return this.rows.filter(row => row.year).map(row => row.year!)
    }

    @computed get hasDayColumn() {
        return this.columnNames.has("day")
    }

    @computed get dayColumn() {
        return this.columns.get("day")
    }

    specToObject() {
        const output: any = {}
        Array.from(this.columns.values()).forEach(col => {
            output[col.slug] = col.spec
        })
        return output
    }

    toJs() {
        return {
            columns: this.specToObject(),
            rows: this.rows
        }
    }

    private static annotationsToMap(annotations: string) {
        // Todo: let's delete this and switch to traditional columns
        const entityAnnotationsMap = new Map<string, string>()
        const delimiter = ":"
        annotations.split("\n").forEach(line => {
            const [key, ...words] = line
                .split(delimiter)
                .map(word => word.trim())
            entityAnnotationsMap.set(key, words.join(delimiter))
        })
        return entityAnnotationsMap
    }

    static makeAnnotationColumnSlug(columnSlug: columnSlug) {
        return columnSlug + "-annotations"
    }

    private static columnSpecFromLegacyVariable(
        variable: OwidVariable
    ): ColumnSpec {
        const slug = variable.id + "-" + slugify(variable.name) // todo: remove?
        const {
            unit,
            shortUnit,
            description,
            coverage,
            datasetId,
            datasetName,
            source,
            display
        } = variable

        return {
            name: variable.name,
            slug,
            isDailyMeasurement: variable.display.yearIsDay,
            unit,
            shortUnit,
            description,
            coverage,
            datasetId,
            datasetName,
            display,
            source,
            owidVariableId: variable.id
        }
    }

    static fromLegacy(json: OwidVariablesAndEntityKey) {
        let rows: OwidRow[] = []
        const entityMetaById: { [id: string]: EntityMeta } = json.entityKey
        const columnSpecs = new Map()
        columnSpecs.set("entityName", {
            slug: "entityName"
        })
        columnSpecs.set("entityId", { slug: "entityId" })
        columnSpecs.set("entityCode", {
            slug: "entityCode"
        })

        for (const key in json.variables) {
            const variable = new OwidVariable(json.variables[key])

            const entityNames = variable.entities.map(
                id => entityMetaById[id].name
            )
            const entityCodes = variable.entities.map(
                id => entityMetaById[id].code
            )

            const columnSpec = this.columnSpecFromLegacyVariable(variable)
            const columnSlug = columnSpec.slug
            columnSpec.isDailyMeasurement
                ? columnSpecs.set("day", { slug: "day" })
                : columnSpecs.set("year", { slug: "year" })
            columnSpecs.set(columnSlug, columnSpec)

            // todo: remove. move annotations to their own first class column.
            let annotationsColumnSlug: string
            let annotationMap: Map<string, string>
            if (variable.display.entityAnnotationsMap) {
                annotationsColumnSlug = this.makeAnnotationColumnSlug(
                    columnSlug
                )
                annotationMap = this.annotationsToMap(
                    variable.display.entityAnnotationsMap
                )
                columnSpecs.set(annotationsColumnSlug, {
                    slug: annotationsColumnSlug
                })
                columnSpec.annotationsColumnSlug = annotationsColumnSlug
            }

            const timeColumnName = columnSpec.isDailyMeasurement
                ? "day"
                : "year"

            // Todo: remove
            const display = variable.display
            const yearsNeedTransform =
                display.yearIsDay &&
                display.zeroDay !== undefined &&
                display.zeroDay !== EPOCH_DATE
            const years = yearsNeedTransform
                ? this.convertLegacyYears(variable.years, display.zeroDay!)
                : variable.years

            const newRows = variable.values.map((value, index) => {
                const entityName = entityNames[index]
                const row: any = {
                    [timeColumnName]: years[index],
                    [columnSlug]: value,
                    entityName,
                    entityId: variable.entities[index],
                    entityCode: entityCodes[index]
                }
                if (annotationsColumnSlug)
                    row[annotationsColumnSlug] = annotationMap.get(entityName)
                return row
            })
            rows = rows.concat(newRows)
        }
        const groupMap = groupBy(rows, row => {
            const timePart =
                row.year !== undefined ? `year:` + row.year : `day:` + row.day
            return timePart + " " + row.entityName
        })

        const joinedRows: OwidRow[] = Object.keys(groupMap).map(groupKey =>
            Object.assign({}, ...groupMap[groupKey])
        )

        return new OwidTable(joinedRows, columnSpecs)
    }

    // todo: remove
    private static convertLegacyYears(years: number[], zeroDay: string) {
        // Only shift years if the variable zeroDay is different from EPOCH_DATE
        // When the dataset uses days (`yearIsDay == true`), the days are expressed as integer
        // days since the specified `zeroDay`, which can be different for different variables.
        // In order to correctly join variables with different `zeroDay`s in a single chart, we
        // normalize all days to be in reference to a single epoch date.
        const diff = diffDateISOStringInDays(zeroDay, EPOCH_DATE)
        return years.map(y => y + diff)
    }
}
