#! /usr/bin/env yarn jest

import * as timezoneMock from "timezone-mock"

import {
    findClosestYear,
    getStartEndValues,
    DataValue,
    formatDay,
    retryPromise,
    computeRollingAverage,
    insertMissingValuePlaceholders,
    rollingMap,
    groupMap
} from "../Util"

describe(findClosestYear, () => {
    describe("without tolerance", () => {
        describe("array", () => {
            it("returns the correct year", () => {
                const years = [2010, 2015, 2017]
                expect(findClosestYear(years, 2015, 0)).toEqual(2015)
            })
            it("returns undefined", () => {
                const years = [2010, 2015, 2017]
                expect(findClosestYear(years, 2014, 0)).toEqual(undefined)
            })
        })
    })

    describe("specified tolerance", () => {
        it("returns the closest year within the specified tolerance", () => {
            const years = [2010, 2015, 2017]
            expect(findClosestYear(years, 2013, 2)).toEqual(2015)
        })
        it("returns undefined outside the tolerance", () => {
            const years = [2010, 2017]
            expect(findClosestYear(years, 2014, 1)).toEqual(undefined)
        })
        it("prefers later years", () => {
            const years = [2010, 2012, 2013, 2017]
            expect(findClosestYear(years, 2011, 3)).toEqual(2012)
            expect(findClosestYear(years, 2015, 3)).toEqual(2017)
        })
    })

    describe("unspecified tolerance", () => {
        it("returns the closest year", () => {
            const years = [1990, 2016]
            expect(findClosestYear(years, 2013)).toEqual(2016)
            expect(findClosestYear(years, 2002)).toEqual(1990)
        })
    })
})

describe(getStartEndValues, () => {
    it("handles an empty array", () => {
        const extent = getStartEndValues([]) as DataValue[]
        expect(extent[0]).toEqual(undefined)
        expect(extent[1]).toEqual(undefined)
    })
    it("handles a single element array", () => {
        const extent = getStartEndValues([
            { year: 2016, value: 1 }
        ]) as DataValue[]
        expect(extent[0].year).toEqual(2016)
        expect(extent[1].year).toEqual(2016)
    })
    it("handles a multi-element array", () => {
        const extent = getStartEndValues([
            { year: 2016, value: -20 },
            { year: 2014, value: 5 },
            { year: 2017, value: 7 }
        ]) as DataValue[]
        expect(extent[0].year).toEqual(2014)
        expect(extent[1].year).toEqual(2017)
    })
})

describe(computeRollingAverage, () => {
    const testCases: {
        numbers: (number | undefined | null)[]
        window: number
        align: "center" | "right"
        result: (number | undefined | null)[]
    }[] = [
        // no smoothing
        {
            numbers: [2, 4, 6, 8],
            window: 1,
            align: "right",
            result: [2, 4, 6, 8]
        },
        {
            numbers: [1, -1, 1, -1],
            window: 2,
            align: "right",
            result: [1, 0, 0, 0]
        },
        {
            numbers: [1, undefined, null, -1, 1],
            window: 2,
            align: "right",
            result: [1, undefined, null, -1, 0]
        },
        {
            numbers: [1, 3, 5, 1],
            window: 3,
            align: "right",
            result: [1, 2, 3, 3]
        },
        {
            numbers: [0, 2, 4, 0],
            window: 3,
            align: "center",
            result: [1, 2, 2, 2]
        }
    ]
    it("computes the rolling average", () => {
        testCases.forEach(testCase => {
            expect(
                computeRollingAverage(
                    testCase.numbers,
                    testCase.window,
                    testCase.align
                )
            ).toEqual(testCase.result)
        })
    })
})

describe(insertMissingValuePlaceholders, () => {
    const testCases = [
        {
            values: [2, -3, 10],
            years: [0, 2, 3],
            expected: [2, null, -3, 10]
        }
    ]
    it("computes the rolling average", () => {
        testCases.forEach(testCase => {
            expect(
                insertMissingValuePlaceholders(testCase.values, testCase.years)
            ).toEqual(testCase.expected)
        })
    })

    const testCasesWithMissing = [
        {
            values: [0, 2, 3],
            years: [0, 2, 3],
            expected: [0, null, 2, 2.5]
        }
    ]

    it("computes the rolling average for data with missing values", () => {
        testCasesWithMissing.forEach(testCase => {
            expect(
                computeRollingAverage(
                    insertMissingValuePlaceholders(
                        testCase.values,
                        testCase.years
                    ),
                    2
                )
            ).toEqual(testCase.expected)
        })
    })
})

describe(formatDay, () => {
    describe("timezones", () => {
        it("formats date consistently in GMT", () => {
            timezoneMock.register("Europe/London")
            expect(formatDay(0)).toEqual("Jan 21, 2020")
            timezoneMock.unregister()
        })

        it("formats date consistently in US/Pacific", () => {
            timezoneMock.register("US/Pacific")
            expect(formatDay(0)).toEqual("Jan 21, 2020")
            timezoneMock.unregister()
        })

        it("formats date consistently in US/Pacific", () => {
            timezoneMock.register("Australia/Adelaide")
            expect(formatDay(0)).toEqual("Jan 21, 2020")
            timezoneMock.unregister()
        })
    })

    describe("epoch", () => {
        it("starts on Jan 21, 2020", () => {
            expect(formatDay(0)).toEqual("Jan 21, 2020")
        })

        it("handles increments", () => {
            expect(formatDay(11)).toEqual("Feb 1, 2020")
        })

        it("handles decrements", () => {
            expect(formatDay(-21)).toEqual("Dec 31, 2019")
        })
    })
})

describe(retryPromise, () => {
    function resolveAfterNthRetry(nth: number, message: string = "success") {
        let retried = 0
        return () =>
            new Promise((resolve, reject) =>
                retried++ >= nth ? resolve(message) : reject()
            )
    }

    it("resolves when promise succeeds first-time", async () => {
        const promiseGetter = resolveAfterNthRetry(0, "success")
        expect(retryPromise(promiseGetter, 1)).resolves.toEqual("success")
    })

    it("resolves when promise succeeds before retry limit", async () => {
        const promiseGetter = resolveAfterNthRetry(2, "success")
        expect(retryPromise(promiseGetter, 3)).resolves.toEqual("success")
    })

    it("rejects when promise doesn't succeed within retry limit", async () => {
        const promiseGetter = resolveAfterNthRetry(3, "success")
        expect(retryPromise(promiseGetter, 3)).rejects.toBeUndefined()
    })
})

describe(rollingMap, () => {
    it("handles empty arrays", () => {
        expect(rollingMap([], () => undefined).length).toEqual(0)
    })
    it("handles arrays with 1 element", () => {
        expect(rollingMap([1], (a, b) => a + b).length).toEqual(0)
    })
    it("handles arrays with multiple elements", () => {
        expect(rollingMap([1, 2, 4, 8], (a, b) => b - a)).toEqual([1, 2, 4])
    })
})

describe(groupMap, () => {
    it("groups by key", () => {
        const group = groupMap([0, 1, "a", 1, 1], v => v)
        expect(group.get(0)).toEqual([0])
        expect(group.get(1)).toEqual([1, 1, 1])
        expect(group.get("a")).toEqual(["a"])
    })
})
