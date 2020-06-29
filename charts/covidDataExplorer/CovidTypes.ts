export declare type PerCapita = boolean
export declare type AlignedOption = boolean
export declare type SmoothingOption = 0 | 3 | 7

export declare type DailyFrequencyOption = boolean
export declare type TotalFrequencyOption = boolean

export declare type countrySlug = string

export declare type MetricKind =
    | "deaths"
    | "cases"
    | "tests"
    | "case_fatality_rate"
    | "tests_per_case"
    | "positive_test_rate"

// https://github.com/owid/covid-19-data/blob/master/public/data/owid-covid-data-codebook.md
export interface ParsedCovidCsvRow {
    iso_code: string
    location: string
    continent: string
    date: string
    total_cases: number
    new_cases: number
    total_deaths: number
    new_deaths: number
    total_cases_per_million: number
    new_cases_per_million: number
    total_deaths_per_million: number
    new_deaths_per_million: number
    total_tests: number
    new_tests: number
    new_tests_smoothed: number
    total_tests_per_thousand: number
    new_tests_per_thousand: number
    new_tests_smoothed_per_thousand: number
    tests_units: string
    stringency_index: number
    population: number
    population_density: number
    median_age: number
    aged_65_older: number
    aged_70_older: number
    gdp_per_capita: number
    extreme_poverty: number
    cvd_death_rate: number
    diabetes_prevalence: number
    female_smokers: number
    male_smokers: number
    handwashing_facilities: number
    hospital_beds_per_thousand: number
}

export interface CovidGrapherRow extends ParsedCovidCsvRow {
    entityName: string
    entityCode: string
    entityId: number
    day: number
}

export interface CountryOption {
    name: string
    slug: countrySlug
    code: string
    continent: string
    population: number
    rows: ParsedCovidCsvRow[]
}

export type CountryOptionWithValue = CountryOption & {
    plotValue: number | string | undefined
}
