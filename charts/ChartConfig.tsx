import * as React from "react"
import * as ReactDOMServer from "react-dom/server"
import {
    observable,
    computed,
    action,
    autorun,
    toJS,
    runInAction,
    reaction,
    IReactionDisposer
} from "mobx"
import { bind } from "decko"

import {
    extend,
    map,
    filter,
    includes,
    uniqWith,
    isEqual,
    defaultTo,
    formatDay,
    formatYear,
    uniq,
    fetchJSON,
    flatten,
    sortBy,
    getErrorMessageRelatedQuestionUrl,
    slugify
} from "./Util"
import { ComparisonLineConfig } from "./ComparisonLine"
import { AxisConfig, AxisConfigProps } from "./AxisConfig"
import { ChartType, ChartTypeType } from "./ChartType"
import { ChartTabOption } from "./ChartTabOption"
import { OwidVariablesAndEntityKey } from "./owidData/OwidVariable"
import { ChartData } from "./ChartData"
import { OwidTable } from "./owidData/OwidTable"
import { ChartDimensionWithOwidVariable } from "./ChartDimensionWithOwidVariable"
import { MapConfig, MapConfigProps } from "./MapConfig"
import { ChartUrl, EntityUrlBuilder } from "./ChartUrl"
import { StackedBarTransform } from "./StackedBarTransform"
import { DiscreteBarTransform } from "./DiscreteBarTransform"
import { StackedAreaTransform } from "./StackedAreaTransform"
import { LineChartTransform } from "./LineChartTransform"
import { ScatterTransform } from "./ScatterTransform"
import { SlopeChartTransform } from "./SlopeChartTransform"
import { Color } from "./Color"
import { ChartView } from "./ChartView"
import { Bounds } from "./Bounds"
import { IChartTransform } from "./ChartTransform"
import { ChartDimension, dimensionProperty } from "./ChartDimension"
import { TooltipProps } from "./Tooltip"
import { LogoOption } from "./Logos"
import { canBeExplorable } from "utils/charts"
import { BAKED_GRAPHER_URL } from "settings"
import {
    minTimeFromJSON,
    maxTimeFromJSON,
    minTimeToJSON,
    maxTimeToJSON,
    TimeBound,
    Time,
    TimeBounds
} from "./TimeBounds"
import {
    GlobalEntitySelection,
    subscribeChartToGlobalEntitySelection
} from "site/client/global-entity/GlobalEntitySelection"
import { TickFormattingOptions } from "./TickFormattingOptions"
import { ColorScaleConfigProps } from "./ColorScaleConfig"
import { countries } from "utils/countries"
import { DataTableTransform } from "./DataTableTransform"
import { getWindowQueryParams } from "utils/client/url"
import { populationMap } from "./PopulationMap"

declare const App: any
declare const window: any

// That node check is taken from the "detect-node" npm package: https://www.npmjs.com/package/detect-node
const isNode: boolean =
    Object.prototype.toString.call(global.process) === "[object process]"
const isJsdom: boolean =
    typeof navigator === "object" && navigator.userAgent.includes("jsdom")

export interface HighlightToggleConfig {
    description: string
    paramStr: string
}

export interface RelatedQuestionsConfig {
    text: string
    url: string
}

interface EntitySelection {
    entityId: number
    index: number // Which dimension the entity is from
    color?: Color
}

// When a user hovers over a connected series line in a ScatterPlot we show
// a label for each point. By default that value will be from the "year" column
// but by changing this option the column used for the x or y axis could be used instead.
export declare type ScatterPointLabelStrategy = "year" | "x" | "y"

export class DimensionSlot {
    chart: ChartConfig
    property: dimensionProperty
    constructor(chart: ChartConfig, property: dimensionProperty) {
        this.chart = chart
        this.property = property
    }

    @computed get name(): string {
        const names = {
            y: this.chart.isDiscreteBar ? "X axis" : "Y axis",
            x: "X axis",
            size: "Size",
            color: "Color",
            filter: "Filter"
        }

        return (names as any)[this.property] || ""
    }

    @computed get allowMultiple(): boolean {
        return (
            this.property === "y" &&
            !(
                this.chart.isScatter ||
                this.chart.isTimeScatter ||
                this.chart.isSlopeChart
            )
        )
    }

    @computed get isOptional(): boolean {
        return this.allowMultiple
    }

    @computed get dimensions(): ChartDimension[] {
        return this.chart.dimensions.filter(d => d.property === this.property)
    }

    set dimensions(dims: ChartDimension[]) {
        let newDimensions: ChartDimension[] = []
        this.chart.dimensionSlots.forEach(slot => {
            if (slot.property === this.property)
                newDimensions = newDimensions.concat(dims)
            else newDimensions = newDimensions.concat(slot.dimensions)
        })
        this.chart.props.dimensions = newDimensions
    }

    @computed get dimensionsWithData(): ChartDimensionWithOwidVariable[] {
        return this.chart.data.filledDimensions.filter(
            d => d.property === this.property
        )
    }

    createDimension(variableId: number) {
        return new ChartDimension({ property: this.property, variableId })
    }
}

// This configuration represents the entire persistent state of a grapher chart
// Ideally, this is also all of the interaction state: when a chart is saved and loaded again
// under the same rendering conditions it ought to remain visually identical
export class ChartConfigProps {
    constructor(initial?: Partial<ChartConfigProps>) {
        if (initial) {
            for (const key in this) {
                if (key in initial) {
                    ;(this as any)[key] = (initial as any)[key]
                }
            }
        }
    }

    @observable.ref type: ChartTypeType = "LineChart"
    @observable.ref isExplorable: boolean = false

    @observable.ref id?: number = undefined
    @observable.ref createdAt?: Date = undefined
    @observable.ref updatedAt?: Date = undefined
    @observable.ref lastEditedByUserId?: number = undefined
    @observable.ref version: number = 1

    @observable.ref slug?: string = undefined
    @observable.ref title?: string = undefined
    @observable.ref subtitle?: string = undefined
    @observable.ref sourceDesc?: string = undefined
    @observable.ref note?: string = undefined
    @observable.ref hideTitleAnnotation?: true = undefined

    @observable.ref xAxis: AxisConfigProps = new AxisConfigProps()
    @observable.ref yAxis: AxisConfigProps = new AxisConfigProps()

    // TODO: These 2 are currently in development. Do not save to DB.
    @observable.ref externalDataUrl?: string = undefined
    @observable.ref owidDataset?: OwidVariablesAndEntityKey = undefined
    @observable.ref entitiesAreCountries?: boolean = undefined

    // Todo: remove once we migrate to all tables
    useV2?: boolean = false

    @observable.ref selectedData: EntitySelection[] = []
    @observable.ref minTime?: TimeBound = undefined
    @observable.ref maxTime?: TimeBound = undefined

    @observable.ref timelineMinTime?: Time = undefined
    @observable.ref timelineMaxTime?: Time = undefined

    @observable.ref dimensions: ChartDimension[] = []
    @observable.ref addCountryMode?:
        | "add-country"
        | "change-country"
        | "disabled" = undefined

    @observable comparisonLines?: ComparisonLineConfig[] = undefined
    @observable.ref highlightToggle?: HighlightToggleConfig = undefined
    @observable.ref stackMode: string = "absolute"
    @observable.ref hideLegend?: true = undefined
    @observable.ref logo?: LogoOption = undefined
    @observable.ref hideLogo?: boolean = undefined
    @observable.ref hideRelativeToggle?: boolean = true
    @observable.ref entityType?: string = undefined
    @observable.ref entityTypePlural?: string = undefined
    @observable.ref hideTimeline?: true = undefined
    @observable.ref zoomToSelection?: true = undefined
    @observable.ref minPopulationFilter?: number = undefined

    // Always show year in labels for bar charts
    @observable.ref showYearLabels?: boolean = undefined

    @observable.ref hasChartTab: boolean = true
    @observable.ref hasMapTab: boolean = false
    @observable.ref tab: ChartTabOption = "chart"
    @observable.ref overlay?: ChartTabOption = undefined

    @observable relatedQuestions?: RelatedQuestionsConfig[]
    @observable.ref internalNotes?: string = undefined
    @observable.ref variantName?: string = undefined
    @observable.ref originUrl?: string = undefined
    @observable.ref isPublished?: true = undefined

    @observable.ref baseColorScheme?: string = undefined
    @observable.ref invertColorScheme?: true = undefined

    // SCATTERPLOT-SPECIFIC OPTIONS

    @observable colorScale: ColorScaleConfigProps = new ColorScaleConfigProps()

    @observable.ref hideLinesOutsideTolerance?: true = undefined

    // Hides lines between points when timeline spans multiple years. Requested by core-econ for certain charts
    @observable hideConnectedScatterLines?: boolean = undefined
    @observable
    scatterPointLabelStrategy?: ScatterPointLabelStrategy = undefined
    @observable.ref compareEndPointsOnly?: true = undefined
    @observable.ref matchingEntitiesOnly?: true = undefined
    @observable excludedEntities?: number[] = undefined

    @observable map: MapConfigProps = new MapConfigProps()

    data?: { availableEntities: string[] } = undefined
}

// TODO: this really represents more than just the configuration state and should be split
// into multiple components. It's sort of the top-level chart state.
export class ChartConfig {
    /** Stores the current chart state. Can be modified to change the chart. */
    props: ChartConfigProps = new ChartConfigProps()

    private origPropsRaw: Readonly<ChartConfigProps>

    /**
     * The original chart props as they are stored in the database. Useful for deriving the URL
     * parameters that need to be applied to reach the current state.
     */
    @computed get origProps(): Readonly<ChartConfigProps> {
        if (typeof App !== "undefined" && App.isEditor) {
            // In the editor, the current chart state is always the "original" state
            return toJS(this.props)
        } else {
            return this.origPropsRaw
        }
    }

    private initialPropsRaw: Readonly<ChartConfigProps>

    /**
     * The chart props after consuming the initial URL parameters but before any user-triggered
     * changes. Helpful for "resetting" embeds to their initial state.
     */
    @computed get initialProps(): Readonly<ChartConfigProps> {
        if (typeof App !== "undefined" && App.isEditor) {
            // In the editor, the current chart state is always the "initial" state
            return toJS(this.props)
        } else {
            return this.initialPropsRaw
        }
    }

    @observable.ref isEmbed: boolean
    @observable.ref isMediaCard: boolean
    @observable.ref isNode: boolean
    @observable.ref isExporting?: boolean
    @observable.ref tooltip?: TooltipProps

    // at startDrag, we want to show the full axis
    @observable.ref useTimelineDomains = false

    @action.bound async downloadData() {
        if (this.props.useV2) return

        if (this.props.externalDataUrl) {
            const json = await fetchJSON(this.props.externalDataUrl)
            this.receiveData(json)
            return
        }

        if (this.props.owidDataset) {
            this.receiveData(this.props.owidDataset)
            return
        }

        if (this.variableIds.length === 0 || this.isNode) {
            // No data to download
            return
        }

        if (window.admin) {
            const json = await window.admin.getJSON(
                `/api/data/variables/${this.dataFileName}`
            )
            this.receiveData(json)
        } else {
            const json = await fetchJSON(this.dataUrl)
            this.receiveData(json)
        }
    }

    @observable.ref table: OwidTable = new OwidTable([])

    // Provide a way to insert an arbitrary element into the embed popup.
    // The "hideControls" property is a param on the explorer, so to maintain
    // modularity between the explorer and chart I am injecting the checkbox this way.
    // In the future if we merge the two we could shift to a cleaner approach.
    @observable.ref embedExplorerCheckbox?: JSX.Element

    @action.bound receiveData(json: OwidVariablesAndEntityKey) {
        this.table = OwidTable.fromLegacy(json)
        this.updatePopulationFilter()
    }

    // todo: refactor
    @computed get selectedCountryNames() {
        // Get the countries that are already selected
        let countryCodes = EntityUrlBuilder.queryParamToEntities(
            this.url?.params.country || ""
        )
        // Get the countries from the url
        countryCodes = countryCodes.concat(
            EntityUrlBuilder.queryParamToEntities(
                getWindowQueryParams().country || ""
            )
        )
        return new Set<string>(
            countryCodes
                .map(code => countries.find(country => country.code === code))
                .filter(i => i)
                .map(c => c!.name)
        )
    }

    @observable.ref setBaseFontSize: number = 16
    @computed get baseFontSize(): number {
        if (this.isMediaCard) return 24
        else if (this.isExporting) return 18
        else return this.setBaseFontSize
    }

    set baseFontSize(val: number) {
        this.setBaseFontSize = val
    }

    @computed get formatYearFunction() {
        return this.table.hasDayColumn
            ? (day: number) => formatDay(day)
            : formatYear
    }

    @computed get formatYearTickFunction() {
        return this.table.hasDayColumn
            ? (day: number, options?: TickFormattingOptions) =>
                  formatDay(
                      day,
                      options?.isFirstOrLastTick ? {} : { format: "MMM D" }
                  )
            : formatYear
    }

    @computed get sortedUniqueEntitiesAcrossDimensions() {
        return sortBy(
            uniq(
                flatten(this.data.filledDimensions.map(d => d.entityNamesUniq))
            )
        )
    }

    data: ChartData
    url: ChartUrl

    @computed get isIframe(): boolean {
        return window.self !== window.top
    }

    private get isEditor(): boolean {
        return typeof App !== "undefined" && App.isEditor
    }

    @computed get isNativeEmbed(): boolean {
        return this.isEmbed && !this.isIframe && !this.isExporting
    }

    @computed.struct private get variableIds() {
        return uniq(this.dimensions.map(d => d.variableId))
    }

    @computed get dataFileName(): string {
        return `${this.variableIds.join("+")}.json?v=${
            this.isEditor ? undefined : this.cacheTag
        }`
    }

    @computed get dataUrl(): string {
        return `${BAKED_GRAPHER_URL}/data/variables/${this.dataFileName}`
    }

    @computed get showAddEntityControls() {
        return !this.hideEntityControls && this.canAddData
    }

    // For now I am only exposing this programmatically for the dashboard builder. Setting this to true
    // allows you to still use add country "modes" without showing the buttons in order to prioritize
    // another entity selector over the built in ones.
    @observable hideEntityControls: boolean = false
    externalCsvLink = ""

    @computed get hasOWIDLogo(): boolean {
        return (
            !this.props.hideLogo &&
            (this.props.logo === undefined || this.props.logo === "owid")
        )
    }

    @computed get hasFatalErrors(): boolean {
        const { relatedQuestions } = this.props
        return (
            relatedQuestions?.some(
                question => !!getErrorMessageRelatedQuestionUrl(question)
            ) || false
        )
    }

    disposers: IReactionDisposer[] = []

    @bind dispose() {
        this.disposers.forEach(dispose => dispose())
    }

    constructor(
        props?: ChartConfigProps,
        options: {
            isEmbed?: boolean
            isMediaCard?: boolean
            queryStr?: string
            globalEntitySelection?: GlobalEntitySelection
        } = {}
    ) {
        this.isEmbed = !!options.isEmbed
        this.isMediaCard = !!options.isMediaCard

        // This attribute is used to decide various client-vs.-server behavior. However, when
        // testing, we want the chart to behave as if it's in the client, even though it's
        // technically being run in a Node environment. To solve this, we override isNode to false
        // if we're in a jsdom environment (where client tests are run). It would probably be best
        // to rename this variable, or better, to break it into one or more behavior flags that
        // could be set by the environment, rather than directly querying the environment itself.
        // -@jasoncrawford 2019-12-04
        this.isNode = isNode && !isJsdom

        this.update(props || { yAxis: { min: 0 } })

        // The original chart props, as stored in the database
        this.origPropsRaw = toJS(this.props)

        this.disposers.push(
            reaction(() => this.variableIds, this.downloadData, {
                fireImmediately: true
            })
        )

        this.disposers.push(
            reaction(
                () => this.props.minPopulationFilter,
                () => {
                    this.updatePopulationFilter()
                }
            )
        )

        this.data = new ChartData(this)
        this.url = new ChartUrl(this, options.queryStr)

        // The chart props after consuming the URL parameters, but before any user interaction
        this.initialPropsRaw = toJS(this.props)

        if (options.globalEntitySelection) {
            this.disposers.push(
                subscribeChartToGlobalEntitySelection(
                    this,
                    options.globalEntitySelection
                )
            )
        }

        if (!this.isNode) this.ensureValidConfig()
    }

    updatePopulationFilter() {
        const slug = "pop_filter"
        const minPop = this.props.minPopulationFilter
        if (!minPop) this.table.deleteColumnBySlug(slug)
        else
            this.table.addFilterColumn(slug, row => {
                const name = row.entityName
                const pop = populationMap[name]
                return !pop || pop >= minPop
            })
    }

    ensureValidConfig() {
        const disposers = [
            autorun(() => {
                if (!this.availableTabs.includes(this.props.tab)) {
                    runInAction(() => (this.props.tab = this.availableTabs[0]))
                }
            }),
            autorun(() => {
                if (this.props.hasMapTab && !this.props.map) {
                    runInAction(() => (this.props.map = new MapConfigProps()))
                }
            }),
            autorun(() => {
                if (!isEqual(this.props.dimensions, this.validDimensions)) {
                    this.props.dimensions = this.validDimensions
                }
            }),
            autorun(() => {
                if (this.props.isExplorable && !canBeExplorable(this.props)) {
                    this.props.isExplorable = false
                }
            })
        ]
        this.disposers.push(...disposers)
    }

    @computed get subtitle() {
        return defaultTo(this.props.subtitle, "")
    }
    @computed get note() {
        return defaultTo(this.props.note, "")
    }
    @computed get internalNotes() {
        return defaultTo(this.props.internalNotes, "")
    }
    @computed get originUrl() {
        return defaultTo(this.props.originUrl, "")
    }

    // todo: do we need this?
    @computed get originUrlWithProtocol(): string {
        let url = this.originUrl
        if (!url.startsWith("http")) url = "https://" + url
        return url
    }

    @computed get isPublished() {
        return defaultTo(this.props.isPublished, false)
    }
    @computed get primaryTab() {
        return this.props.tab
    }
    @computed get overlayTab() {
        return this.props.overlay
    }
    @computed get addCountryMode() {
        return this.props.addCountryMode || "add-country"
    }
    @computed get highlightToggle() {
        return this.props.highlightToggle
    }
    @computed get hasChartTab() {
        return this.props.hasChartTab
    }
    @computed get hasMapTab() {
        return this.props.hasMapTab
    }
    @computed get hideLegend() {
        return this.props.hideLegend
    }
    @computed get baseColorScheme() {
        return this.props.baseColorScheme
    }
    @computed get comparisonLines() {
        return this.props.comparisonLines || []
    }

    @computed get entityType() {
        return defaultTo(this.props.entityType, "country")
    }

    @computed get entityTypePlural() {
        return defaultTo(this.props.entityTypePlural, "countries")
    }

    @computed get tab() {
        return this.props.overlay ? this.props.overlay : this.props.tab
    }

    set tab(value) {
        if (value === "chart" || value === "map" || value === "table") {
            this.props.tab = value
            this.props.overlay = undefined
        } else {
            // table tab cannot be downloaded, so revert to default tab
            if (value === "download" && this.props.tab === "table") {
                this.props.tab = this.origProps.tab
            }
            this.props.overlay = value
        }
    }

    @computed get timeDomain(): TimeBounds {
        return [
            // Handle `undefined` values in minTime/maxTime
            minTimeFromJSON(this.props.minTime),
            maxTimeFromJSON(this.props.maxTime)
        ]
    }

    set timeDomain(value: TimeBounds) {
        this.props.minTime = value[0]
        this.props.maxTime = value[1]
    }

    @computed get xAxis() {
        return new AxisConfig(this.props.xAxis)
    }

    @computed get yAxis() {
        return new AxisConfig(this.props.yAxis)
    }

    // Get the dimension slots appropriate for this type of chart
    @computed get dimensionSlots(): DimensionSlot[] {
        const xAxis = new DimensionSlot(this, "x")
        const yAxis = new DimensionSlot(this, "y")
        const color = new DimensionSlot(this, "color")
        const size = new DimensionSlot(this, "size")

        if (this.isScatter) return [yAxis, xAxis, size, color]
        else if (this.isTimeScatter) return [yAxis, xAxis]
        else if (this.isSlopeChart) return [yAxis, size, color]
        else return [yAxis]
    }

    @computed get validDimensions(): ChartDimension[] {
        const { dimensions } = this.props
        const validProperties = map(this.dimensionSlots, "property")
        let validDimensions = filter(dimensions, dim =>
            includes(validProperties, dim.property)
        )

        this.dimensionSlots.forEach(slot => {
            if (!slot.allowMultiple)
                validDimensions = uniqWith(
                    validDimensions,
                    (a: ChartDimension, b: ChartDimension) =>
                        a.property === slot.property &&
                        a.property === b.property
                )
        })

        return validDimensions
    }

    @computed get dimensions() {
        return this.props.dimensions
    }

    @computed private get defaultSlug(): string {
        return slugify(this.title)
    }

    @computed get slug(): string {
        return defaultTo(this.props.slug, this.defaultSlug)
    }

    @computed get availableTabs(): ChartTabOption[] {
        return filter([
            this.props.hasChartTab && "chart",
            this.props.hasMapTab && "map",
            "table",
            "sources",
            "download"
        ]) as ChartTabOption[]
    }

    @action.bound update(json: any) {
        for (const key in this.props) {
            if (key in json && key !== "xAxis" && key !== "yAxis") {
                ;(this.props as any)[key] = json[key]
            }
        }

        if (json.isAutoTitle) this.props.title = undefined

        // Auto slug is only preserved for drafts in the editor
        // Once published, slug should stick around (we don't want to create too many redirects)
        if (json.isAutoSlug && App.isEditor && !json.isPublished)
            this.props.slug = undefined

        // JSON doesn't support Infinity, so we use strings instead.
        this.props.minTime = minTimeFromJSON(json.minTime)
        this.props.maxTime = maxTimeFromJSON(json.maxTime)

        if (json.map) {
            this.props.map = new MapConfigProps({
                ...json.map,
                targetYear: maxTimeFromJSON(json.map.targetYear)
            })
        }

        extend(this.props.xAxis, json["xAxis"])
        extend(this.props.yAxis, json["yAxis"])

        this.props.dimensions = (json.dimensions || []).map(
            (j: any) => new ChartDimension(j)
        )
    }

    @computed get currentTitle(): string {
        let text = this.title

        if (
            this.primaryTab === "chart" &&
            this.addCountryMode !== "add-country" &&
            this.data.selectedEntities.length === 1 &&
            (!this.props.hideTitleAnnotation || this.canChangeEntity)
        ) {
            const { selectedEntities } = this.data
            const entityStr = selectedEntities.join(", ")
            if (entityStr.length > 0) {
                text = text + ", " + entityStr
            }
        }

        if (
            !this.props.hideTitleAnnotation &&
            this.isLineChart &&
            this.lineChart.isRelativeMode
        ) {
            text =
                "Change in " +
                (text.charAt(1).match(/[A-Z]/)
                    ? text
                    : text.charAt(0).toLowerCase() + text.slice(1))
        }

        // Causes difficulties with charts like https://ourworldindata.org/grapher/antibiotic-use-in-livestock-in-europe
        /*if (chart.props.tab === "map" && chart.map.props.projection !== "World") {
            const label = labelsByRegion[chart.map.props.projection]
            text = text + ` in ${label}`
        }*/

        if (
            !this.props.hideTitleAnnotation ||
            (this.isLineChart &&
                this.lineChart.isSingleYear &&
                this.lineChart.hasTimeline) ||
            (this.primaryTab === "map" && this.map.data.hasTimeline)
        ) {
            const { minYear, maxYear } = this
            const timeFrom = this.formatYearFunction(minYear)
            const timeTo = this.formatYearFunction(maxYear)
            const time =
                timeFrom === timeTo ? timeFrom : timeFrom + " to " + timeTo

            text = text + ", " + time
        }

        return text.trim()
    }

    @computed get maxYear(): number {
        //if (chart.isScatter && !chart.scatter.failMessage && chart.scatter.xOverrideYear != undefined)
        //    return undefined
        if (this.tab === "table") return this.dataTableTransform.endYear
        else if (this.primaryTab === "map") return this.map.data.targetYear
        else if (this.isScatter && !this.scatter.failMessage)
            return this.scatter.endYear
        else if (this.isDiscreteBar && !this.discreteBar.failMessage)
            return this.discreteBar.targetYear
        else return this.lineChart.endYear
    }

    @computed get isSingleEntity(): boolean {
        return (
            this.table.availableEntities.length === 1 ||
            this.addCountryMode === "change-country"
        )
    }

    @computed get isSingleVariable(): boolean {
        return this.data.primaryDimensions.length === 1
    }

    // XXX refactor into the transforms
    @computed get minYear(): number {
        //if (chart.isScatter && !chart.scatter.failMessage && chart.scatter.xOverrideYear != undefined)
        //    return undefined
        if (this.tab === "table") return this.dataTableTransform.startYear
        else if (this.primaryTab === "map") return this.map.data.targetYear
        else if (this.isScatter && !this.scatter.failMessage)
            return this.scatter.startYear
        else if (this.isDiscreteBar && !this.discreteBar.failMessage)
            return this.discreteBar.targetYear
        else return this.lineChart.startYear
    }

    @computed get sourcesLine(): string {
        return this.props.sourceDesc !== undefined
            ? this.props.sourceDesc
            : this.defaultSourcesLine
    }

    @computed get canAddData(): boolean {
        return (
            this.addCountryMode === "add-country" &&
            this.data.availableKeys.length > 1
        )
    }

    @computed get canChangeEntity(): boolean {
        return (
            !this.isScatter &&
            this.addCountryMode === "change-country" &&
            this.data.availableEntities.length > 1
        )
    }

    @computed private get defaultSourcesLine(): string {
        let sourceNames = this.data.sourcesWithDimension.map(
            source => source.source.name
        )

        // Shorten automatic source names for certain major sources
        sourceNames = sourceNames.map(sourceName => {
            for (const majorSource of [
                "World Bank – WDI",
                "World Bank",
                "ILOSTAT"
            ]) {
                if (sourceName.startsWith(majorSource)) return majorSource
            }
            return sourceName
        })

        return uniq(sourceNames).join(", ")
    }

    @computed private get defaultTitle(): string {
        const { primaryDimensions } = this.data
        if (this.isScatter)
            return this.data.axisDimensions
                .map(d => d.displayName)
                .join(" vs. ")
        else if (
            primaryDimensions.length > 1 &&
            uniq(map(primaryDimensions, d => d.column.datasetName)).length === 1
        )
            return primaryDimensions[0].column.datasetName!
        else if (primaryDimensions.length === 2)
            return primaryDimensions.map(d => d.displayName).join(" and ")
        else return primaryDimensions.map(d => d.displayName).join(", ")
    }

    @computed get title(): string {
        return this.props.title !== undefined
            ? this.props.title
            : this.defaultTitle
    }

    @computed.struct get json(): Readonly<any> {
        const json: any = toJS(this.props)

        // Chart title and slug may be autocalculated from data, in which case they won't be in props
        // But the server will need to know what we calculated in order to do its job
        if (!this.props.title) {
            json.title = this.title
            json.isAutoTitle = true
        }
        if (!this.props.slug) {
            json.slug = this.slug
            json.isAutoSlug = true
        }

        // Remove the overlay tab state (e.g. download or sources) in order to avoid saving charts
        // in the Grapher Admin with an overlay tab open
        json.overlay = undefined

        json.data = {
            availableEntities: this.data.availableEntities
        }

        // JSON doesn't support Infinity, so we use strings instead.
        json.minTime = minTimeToJSON(this.props.minTime)
        json.maxTime = maxTimeToJSON(this.props.maxTime)

        if (this.props.map) {
            json.map.targetYear = maxTimeToJSON(this.props.map.targetYear)
        }

        return json
    }

    @computed get isLineChart() {
        return this.props.type === ChartType.LineChart
    }
    @computed get isScatter() {
        return this.props.type === ChartType.ScatterPlot
    }
    @computed get isTimeScatter() {
        return this.props.type === ChartType.TimeScatter
    }
    @computed get isStackedArea() {
        return this.props.type === ChartType.StackedArea
    }
    @computed get isSlopeChart() {
        return this.props.type === ChartType.SlopeChart
    }
    @computed get isDiscreteBar() {
        return this.props.type === ChartType.DiscreteBar
    }
    @computed get isStackedBar() {
        return this.props.type === ChartType.StackedBar
    }

    @computed get lineChart() {
        return new LineChartTransform(this)
    }
    @computed get scatter() {
        return new ScatterTransform(this)
    }
    @computed get stackedArea() {
        return new StackedAreaTransform(this)
    }
    @computed get slopeChart() {
        return new SlopeChartTransform(this)
    }
    @computed get discreteBar() {
        return new DiscreteBarTransform(this)
    }
    @computed get stackedBar() {
        return new StackedBarTransform(this)
    }
    @computed get map() {
        return new MapConfig(this)
    }
    @computed get dataTableTransform() {
        return new DataTableTransform(this)
    }

    @computed get activeTransform(): IChartTransform {
        if (this.isLineChart) return this.lineChart
        else if (this.isScatter || this.isTimeScatter) return this.scatter
        else if (this.isStackedArea) return this.stackedArea
        else if (this.isSlopeChart) return this.slopeChart
        else if (this.isDiscreteBar) return this.discreteBar
        else if (this.isStackedBar) return this.stackedBar
        else throw new Error("No transform found")
    }

    @computed get idealBounds(): Bounds {
        return this.isMediaCard
            ? new Bounds(0, 0, 1200, 630)
            : new Bounds(0, 0, 850, 600)
    }

    @computed get staticSVG(): string {
        const svg = ReactDOMServer.renderToStaticMarkup(
            <ChartView chart={this} isExport={true} bounds={this.idealBounds} />
        )

        return svg
    }

    @computed get cacheTag(): string {
        return this.props.version.toString()
    }

    @computed get isExplorable(): boolean {
        return this.props.isExplorable
    }
}
