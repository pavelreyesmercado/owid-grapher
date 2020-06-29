import { ColumnSpec } from "charts/owidData/OwidTable"
import { MetricKind } from "./CovidTypes"
import { cloneDeep } from "lodash"
import { getColumnSlug } from "./CovidDataUtils"

// Normally all variables come from the WP backend. In this attempt I try and generate variables client side.
// This map contains the meta data for these generated variables which they then can extend. There's the obvious
// issue that this file can get out of data with the WP backend. In addition, this approach is fine for simple
// transformations, but for generating slightly more complex variables like rolling windows with certain parameters,
// which are easy with Pandas, become not as simple if we have to roll our own data transformation library.
// We may want to revert to a Chart Builder that cannot generate variables on the fly.
export const columnSpecs: { [name: string]: ColumnSpec } = {
    positive_test_rate: {
        owidVariableId: 142721,
        slug: "cumulative_positivity_rate",
        name: "cumulative_positivity_rate",
        annotationsColumnSlug: "tests_units",
        unit: "",
        description:
            "The number of confirmed cases divided by the number of tests, expressed as a percentage. Tests may refer to the number of tests performed or the number of people tested – depending on which is reported by the particular country.",
        coverage: "",
        display: {
            name: "Cumulative positivity rate",
            unit: "%",
            shortUnit: "%",
            yearIsDay: true,
            conversionFactor: 100
        },
        datasetName: "COVID testing time series data",
        source: {
            id: 17805,
            name: "Official data collated by Our World in Data",
            dataPublishedBy:
                "For source details see ourworldindata.org/covid-testing#source-information-country-by-country",
            dataPublisherSource:
                "For source details see ourworldindata.org/covid-testing#source-information-country-by-country",
            link:
                "ourworldindata.org/covid-testing#source-information-country-by-country",
            retrievedDate: "",
            additionalInfo:
                "Data on COVID-19 testing. Comparisons between countries are compromised for several reasons.\n\nYou can download the full dataset, alongside detailed source descriptions here: https://github.com/owid/covid-19-data/tree/master/public/data/"
        }
    },
    tests_per_case: {
        owidVariableId: 142754,
        slug: "short_term_tests_per_case",
        name: "short_term_tests_per_case",
        annotationsColumnSlug: "tests_units",
        unit: "",
        description:
            "The number of tests divided by the number of confirmed cases. Not all countries report testing data on a daily basis.",
        coverage: "",
        display: {
            name: "Tests per confirmed case – daily",
            unit: "tests per confirmed case",
            yearIsDay: true
        },
        datasetName: "COVID testing time series data",
        source: {
            id: 17805,
            name: "Official data collated by Our World in Data",
            dataPublishedBy:
                "For source details see ourworldindata.org/covid-testing#source-information-country-by-country",
            dataPublisherSource:
                "For source details see ourworldindata.org/covid-testing#source-information-country-by-country",
            link:
                "ourworldindata.org/covid-testing#source-information-country-by-country",
            retrievedDate: "",
            additionalInfo:
                "Data on COVID-19 testing. Comparisons between countries are compromised for several reasons.\n\nYou can download the full dataset, alongside detailed source descriptions here: https://github.com/owid/covid-19-data/tree/master/public/data/"
        }
    },
    case_fatality_rate: {
        slug: "case_fatality_rate",
        owidVariableId: 142600,
        name:
            "Case fatality rate of COVID-19 (%) (Only observations with ≥100 cases)",
        unit: "",
        description: `The Case Fatality Rate (CFR) is the ratio between confirmed deaths and confirmed cases. During an outbreak of a pandemic the CFR is a poor measure of the mortality risk of the disease. We explain this in detail at OurWorldInData.org/Coronavirus`,
        coverage: "",
        display: { unit: "%", zeroDay: "2020-01-21", yearIsDay: true },
        datasetName: "COVID-2019 - ECDC (2020)",
        source: {
            id: 17801,
            name:
                "European CDC – Situation Update Worldwide – Last updated 3rd June, 11:00 (London time)",
            dataPublishedBy:
                "European Centre for Disease Prevention and Control (ECDC)",
            dataPublisherSource: "",
            link:
                "https://github.com/owid/covid-19-data/tree/master/public/data",
            retrievedDate: "",
            additionalInfo:
                'Raw data on confirmed cases and deaths for all countries is sourced from the <a href="https://www.ecdc.europa.eu/en/publications-data/download-todays-data-geographic-distribution-covid-19-cases-worldwide">European Centre for Disease Prevention and Control (ECDC)</a>.  \n\nOur complete COVID-19 dataset is a collection of the COVID-19 data maintained by <em>Our World in Data</em>. <strong>It is updated daily</strong> and includes data on confirmed cases, deaths, and testing.\n\nWe have created a new description of all our data sources. You find it at our GitHub repository <strong><a href="https://github.com/owid/covid-19-data/tree/master/public/data/">here</a></strong>. There you can download all of our data.\n\n'
        }
    },
    cases: {
        slug: "cases",
        owidVariableId: 142581,
        name: "Confirmed cases of COVID-19",
        unit: "",
        description: `The number of confirmed cases is lower than the number of actual cases; the main reason for that is limited testing.`,
        coverage: "",
        display: {
            name: "confirmed cases",
            unit: "cases",
            zeroDay: "2020-01-21",
            yearIsDay: true,
            numDecimalPlaces: 0
        },
        datasetName: "COVID-2019 - ECDC (2020)",
        source: {
            id: 17801,
            name: "European CDC – Situation Update Worldwide",
            dataPublishedBy:
                "European Centre for Disease Prevention and Control (ECDC)",
            dataPublisherSource: "",
            link: "https://github.com/owid/covid-19-data",
            retrievedDate: "",
            additionalInfo:
                'Raw data on confirmed cases and deaths for all countries is sourced from the <a href="https://www.ecdc.europa.eu/en/publications-data/download-todays-data-geographic-distribution-covid-19-cases-worldwide">European Centre for Disease Prevention and Control (ECDC)</a>.  \n\nOur complete COVID-19 dataset is a collection of the COVID-19 data maintained by <em>Our World in Data</em>. <strong>It is updated daily</strong> and includes data on confirmed cases, deaths, and testing.\n\nWe have created a new description of all our data sources. You find it at our GitHub repository <strong><a href="https://github.com/owid/covid-19-data/tree/master/public/data/">here</a></strong>. There you can download all of our data.\n\n'
        }
    },
    deaths: {
        slug: "deaths",
        owidVariableId: 142583,
        name: "Confirmed deaths due to COVID-19",
        unit: "",
        description: `Limited testing and challenges in the attribution of the cause of death means that the number of confirmed deaths may not be an accurate count of the true number of deaths from COVID-19.`,
        coverage: "",
        display: {
            name: "confirmed deaths",
            unit: "deaths",
            zeroDay: "2020-01-21",
            yearIsDay: true,
            numDecimalPlaces: 0
        },
        datasetName: "COVID-2019 - ECDC (2020)",
        source: {
            id: 17801,
            name: "European CDC – Situation Update Worldwide",
            dataPublishedBy:
                "European Centre for Disease Prevention and Control (ECDC)",
            dataPublisherSource: "",
            link: "https://github.com/owid/covid-19-data",
            retrievedDate: "",
            additionalInfo:
                'Raw data on confirmed cases and deaths for all countries is sourced from the <a href="https://www.ecdc.europa.eu/en/publications-data/download-todays-data-geographic-distribution-covid-19-cases-worldwide">European Centre for Disease Prevention and Control (ECDC)</a>.  \n\nOur complete COVID-19 dataset is a collection of the COVID-19 data maintained by <em>Our World in Data</em>. <strong>It is updated daily</strong> and includes data on confirmed cases, deaths, and testing.\n\nWe have created a new description of all our data sources. You find it at our GitHub repository <strong><a href="https://github.com/owid/covid-19-data/tree/master/public/data/">here</a></strong>. There you can download all of our data.\n\n'
        }
    },
    tests: {
        slug: "tests",
        owidVariableId: 142601,
        name: "tests",
        unit: "",
        description: "",
        coverage: "",
        annotationsColumnSlug: "tests_units",
        datasetId: "covid",
        shortUnit: "",
        display: {
            name: "tests",
            yearIsDay: true,
            numDecimalPlaces: 0
        },
        datasetName: "COVID testing time series data",
        source: {
            id: 17805,
            name: "Official data collated by Our World in Data",
            dataPublishedBy:
                "For source details see ourworldindata.org/covid-testing#source-information-country-by-country",
            dataPublisherSource:
                "For source details see ourworldindata.org/covid-testing#source-information-country-by-country",
            link:
                "ourworldindata.org/covid-testing#source-information-country-by-country",
            retrievedDate: "",
            additionalInfo:
                "Data on COVID-19 testing. Comparisons between countries are compromised for several reasons.\n\nYou can download the full dataset, alongside detailed source descriptions here: https://github.com/owid/covid-19-data/tree/master/public/data/testing"
        }
    },
    days_since: {
        slug: "days_since",
        owidVariableId: 99999,
        name: "",
        unit: "",
        description: "",
        coverage: "",
        shortUnit: "",
        display: {
            zeroDay: "2020-01-21",
            yearIsDay: true,
            numDecimalPlaces: 0
        },
        datasetName: "COVID-2019 - ECDC (2020)",
        source: {
            id: 17801,
            name: "European CDC – Situation Update Worldwide",
            dataPublishedBy:
                "European Centre for Disease Prevention and Control (ECDC)",
            dataPublisherSource: "",
            link: "https://github.com/owid/covid-19-data",
            retrievedDate: "",
            additionalInfo:
                'Raw data on confirmed cases and deaths for all countries is sourced from the <a href="https://www.ecdc.europa.eu/en/publications-data/download-todays-data-geographic-distribution-covid-19-cases-worldwide">European Centre for Disease Prevention and Control (ECDC)</a>.  \n\nOur complete COVID-19 dataset is a collection of the COVID-19 data maintained by <em>Our World in Data</em>. <strong>It is updated daily</strong> and includes data on confirmed cases, deaths, and testing.\n\nWe have created a new description of all our data sources. You find it at our GitHub repository <strong><a href="https://github.com/owid/covid-19-data/tree/master/public/data/">here</a></strong>. There you can download all of our data.\n\n'
        }
    },
    continents: {
        owidVariableId: 123,
        slug: "continent",
        name: "Countries Continents",
        unit: "",
        description: "Countries and their associated continents.",
        coverage: "",
        shortUnit: "",
        display: { includeInTable: false },
        datasetName: "Countries Continents",
        source: {
            id: 44,
            name: "Our World In Data",
            dataPublishedBy: "",
            dataPublisherSource: "",
            link: "",
            retrievedDate: "",
            additionalInfo: ""
        }
    }
}

type MetricKey = {
    [K in MetricKind]: number
}

const buildCovidVariableId = (
    name: MetricKind,
    perCapita: number,
    rollingAverage?: number,
    daily?: boolean
): number => {
    const arbitraryStartingPrefix = 1145
    const names: MetricKey = {
        tests: 0,
        cases: 1,
        deaths: 2,
        positive_test_rate: 3,
        case_fatality_rate: 4,
        tests_per_case: 5
    }
    const parts = [
        arbitraryStartingPrefix,
        names[name],
        daily ? 1 : 0,
        perCapita,
        rollingAverage
    ]
    return parseInt(parts.join(""))
}

export const buildColumnSpec = (
    name: MetricKind,
    perCapita: number,
    daily?: boolean,
    rollingAverage?: number,
    updatedTime?: string
): ColumnSpec => {
    const spec = cloneDeep(columnSpecs[name]) as ColumnSpec
    spec.slug = getColumnSlug(name, perCapita, daily, rollingAverage)
    spec.owidVariableId = buildCovidVariableId(
        name,
        perCapita,
        rollingAverage,
        daily
    )
    spec.source!.name = `${spec.source!.name}${updatedTime}`

    const messages: { [index: number]: string } = {
        1: "",
        1e3: " per thousand people",
        1e6: " per million people"
    }

    spec.display!.name = `${daily ? "Daily " : "Cumulative "}${
        spec.display!.name
    }${messages[perCapita]}`

    // Show decimal places for rolling average & per capita variables
    if (perCapita > 1) {
        spec.display!.numDecimalPlaces = 2
    } else if (
        name === "positive_test_rate" ||
        name === "case_fatality_rate" ||
        (rollingAverage && rollingAverage > 1)
    ) {
        spec.display!.numDecimalPlaces = 1
    } else {
        spec.display!.numDecimalPlaces = 0
    }

    return spec
}
