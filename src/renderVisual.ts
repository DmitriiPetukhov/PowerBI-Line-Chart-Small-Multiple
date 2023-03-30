"use strict";

import powerbi from "powerbi-visuals-api";
import {
    Coordinates,
    d3Selection,
    LabelsAction,
    LineDataPoint,
    SimplePoint,
    VerticalLineDataItemsGlobalWithKey,
    VisualDomain,
    VisualViewModel,
    XAxisData
} from "./visualInterfaces";
import {IInteractivityService} from "powerbi-visuals-utils-interactivityutils/lib/interactivityBaseService";
import {ITooltipServiceWrapper} from "powerbi-visuals-utils-tooltiputils";
import {AxisPosition, DataLabelEps, DataLabelR, NiceDateFormat, Shapes, VisualSettings} from "./settings";
import {IValueFormatter, ValueFormatterOptions} from "powerbi-visuals-utils-formattingutils/lib/src/valueFormatter";
import {Formatter, getLineStyleParam} from "./utilities/vizUtility";
import {
    DisplayUnitSystemType
} from "powerbi-visuals-utils-formattingutils/lib/src/displayUnitSystem/displayUnitSystemType";
import {Visual} from "./visual";
import {
    scaleLinear as d3scaleLinear,
    scaleLog as d3scaleLog,
    scaleOrdinal as d3scaleOrdinal,
    scalePoint as d3scalePoint,
    scaleTime as d3scaleTime,
} from "d3-scale";
import {
    fromPoint,
    fromPointToPixel,
    measureTextWidth,
    TextProperties,
    truncateAxis,
    wrapAxis
} from "./utilities/textUtility";
import {getTailoredTextOrDefault} from "powerbi-visuals-utils-formattingutils/lib/src/textMeasurementService";
import {Line as d3Line} from 'd3-shape';
import {axisBottom as d3axisBottom, AxisDomain, AxisScale} from "d3-axis";
import {MarkersUtility} from "./utilities/markersUtility";
import {getOpacity} from "./behavior";
import {select as d3select} from "d3-selection";
import {SeriesMarkerShape} from "./seriesMarkerShape";
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import PrimitiveValue = powerbi.PrimitiveValue;

export class RenderVisual {
    private categories: PrimitiveValue[];
    private categoryIsDate: boolean;
    private categoryIsScalar: boolean;
    private categoryName: string;
    private valuesName: string;
    private settings: VisualSettings;

    private xFormatter: IValueFormatter;
    private yFormatter: IValueFormatter;
    private dataLabelFormatter: IValueFormatter;
    private tooltipFormatter: IValueFormatter;
    private tooltipServiceWrapper: ITooltipServiceWrapper;
    public verticalLineDataItemsGlobal: VerticalLineDataItemsGlobalWithKey;

    private domainY: VisualDomain;
    private isSeparateDomainY: boolean;
    private interactivityService: IInteractivityService<any>;
    private hasSelection: boolean;

    private ResponsiveMinWidth: number = 50;
    private ResponsiveMinHeight: number = 50;
    private MaxYLogScaleShowDivider: number = 15;
    private MaxLogScaleDivider: number = 10;

    constructor(host: IVisualHost, container: d3Selection<any>, model: VisualViewModel, domainY: VisualDomain, interactivityService: IInteractivityService<any>, tooltipServiceWrapper: ITooltipServiceWrapper) {
        this.categories = model.categories;
        this.categoryIsDate = model.categoryIsDate;
        this.categoryIsScalar = model.categoryIsScalar;
        this.categoryName = model.categoryName;
        this.valuesName = model.valuesName;
        this.settings = model.settings;
        this.domainY = domainY;
        this.isSeparateDomainY = model.settings.yAxis.chartRangeType == "separate";

        if (model.categoryIsScalar) {
            this.xFormatter = Formatter.getFormatter({
                format: model.categoryFormat,
                value: model.settings.xAxis.displayUnits,
                precision: model.settings.xAxis.precision,
                displayUnitSystemType: 0,
                cultureSelector: host.locale
            });
        } else {
            let format: string = (model.categoryIsDate && !model.categoryFormat) ? NiceDateFormat : model.categoryFormat;
            this.xFormatter = Formatter.getFormatter({
                format: format,
                cultureSelector: host.locale
            });
        }

        this.yFormatter = Formatter.getFormatter({
            format: model.valueFormat,
            value: model.settings.yAxis.displayUnits,
            formatSingleValues: (model.settings.yAxis.displayUnits == 0),
            precision: model.settings.yAxis.precision,
            displayUnitSystemType: 0,
            cultureSelector: host.locale
        });
        let displayUnits: number = model.settings.dataLabels.displayUnits != 0 ? model.settings.dataLabels.displayUnits : model.settings.yAxis.displayUnits;
        let precision: number = model.settings.dataLabels.precision != null ? model.settings.dataLabels.precision : 1;
        let properties: ValueFormatterOptions = {
            value: displayUnits,
            formatSingleValues: displayUnits == 0,
            allowFormatBeautification: true,
            displayUnitSystemType: DisplayUnitSystemType.DataLabels,
            precision: precision,
            cultureSelector: host.locale
        };
        this.dataLabelFormatter = Formatter.getFormatter(properties);
        this.tooltipFormatter = Formatter.getFormatter({
            value: 0,
            precision: null,
            displayUnitSystemType: 0,
            cultureSelector: host.locale
        });
        this.interactivityService = interactivityService;
        this.hasSelection = interactivityService && interactivityService.hasSelection();
        this.tooltipServiceWrapper = tooltipServiceWrapper;
        this.verticalLineDataItemsGlobal = {};

        //clear drawed lines
        container.selectAll(Visual.SmallMultipleSelector.selectorName).remove();
    }

    // public renderSmallMultipleWithTitle(itemContainer: d3Selection<SVGElement>, itemWidth: number, itemHeight: number,
    //                                     titleHeight: number, title: string,
    //                                     lines: LineDataPoint[], lineKey: string,
    //                                     rectGlobalX: number, rectGlobalY: number) {
    //     itemContainer.classed(Visual.SmallMultipleSelector.className, true);
    //     if (this.settings.smallMultiple.showChartTitle) {
    //         let textContainer: d3Selection<SVGElement> = itemContainer.append("g")
    //             .attr('width', itemWidth)
    //             .attr('height', titleHeight);
    //         textContainer.append('rect')
    //             .classed('clearCatcher', true)
    //             .attr('width', itemWidth)
    //             .attr('height', titleHeight);
    //
    //         let titleFontFamily: string = this.settings.smallMultiple.fontFamily;
    //         let titleFontSize: string = this.settings.smallMultiple.fontSize + "px";
    //         let titleTextProp: TextProperties = {
    //             text: title,
    //             fontFamily: titleFontFamily,
    //             fontSize: titleFontSize
    //         };
    //         let titleWidth: number = measureTextWidth(titleTextProp);
    //         let titleX: number = (titleWidth > itemWidth) ? 0 : (itemWidth - titleWidth) / 2;
    //         let shortTitle = getTailoredTextOrDefault(titleTextProp, itemWidth);
    //
    //         textContainer.append("text")
    //             .classed(Visual.SmallMultipleNameSelector.className, true)
    //             .attr("font-family", titleFontFamily)
    //             .attr("font-size", titleFontSize)
    //             .attr("fill", this.settings.smallMultiple.smColor)
    //             .attr('height', titleHeight)
    //             .attr("x", titleX)
    //             .attr("y", titleHeight * 2 / 3)
    //             .text(shortTitle);
    //         textContainer.append("title").text(title);
    //
    //         let svgContainer: d3Selection<SVGElement> = itemContainer
    //             .append('g')
    //             .attr('width', itemWidth)
    //             .attr('height', itemHeight)
    //             .attr('transform', 'translate(0,' + titleHeight + ')');
    //         this.renderSmallMultiple(svgContainer, lines, itemWidth, itemHeight, lineKey, false, 0, false, rectGlobalX, rectGlobalY + titleHeight);
    //     } else {
    //         this.renderSmallMultiple(itemContainer, lines, itemWidth, itemHeight, lineKey, false, 0, false, rectGlobalX, rectGlobalY);
    //     }
    // }

    public retrieveNewLegendPosition(
        svgContainer: d3Selection<SVGElement>,
        lines: LineDataPoint[],
        width: number,
        height: number,
        legendPosition: string,
        legendHeight: number): string {
        if (!this.settings.general.responsive || legendPosition == "None")
            return legendPosition;
        let resultLegendPosition: string = legendPosition;

        let axisPadding: number = this.retrieveAxisPadding();
        let yAxisWidth = this.retrieveYAxisWidth(lines, svgContainer);
        let axisMargin: number = this.retrieveAxisMargin();
        let totalXWidth: number = width - yAxisWidth - axisPadding - 2 * axisMargin;

        if ((width - yAxisWidth - axisPadding - 2 * axisMargin < this.ResponsiveMinWidth)) {
            yAxisWidth = width - this.ResponsiveMinWidth - axisPadding - 2 * axisMargin;
            let minYAxisWidth: number = measureTextWidth({
                fontSize: this.settings.yAxis.fontSize + "px",
                fontFamily: this.settings.yAxis.fontFamily,
                text: "..."
            });
            if (yAxisWidth < minYAxisWidth) {
                axisPadding = 0;
                axisMargin = 5;
                yAxisWidth = 0;
            }
            if (legendPosition != "Top" && legendPosition != "TopCenter")
                return "Top";
        }
        totalXWidth = width - yAxisWidth - axisPadding - 2 * axisMargin;

        let xAxisDataPoints = this.categories;
        let xRange: number[] = this.retrieveXRange(yAxisWidth, axisPadding, axisMargin, width);
        let xIsCategorical: boolean = (this.settings.xAxis.axisType === 'categorical');
        let xAxisData: XAxisData = this.retrieveXData(xIsCategorical, lines, xAxisDataPoints, xRange);
        let x = xAxisData.x;

        let tickMaxWidth = xAxisDataPoints.length > 0
            ? ((xRange[1] - xRange[0]) / xAxisDataPoints.length)
            : 0;
        let plotSize = {width: width, height: height};
        let xAxisHeight = this.renderXAxis(svgContainer, plotSize, x, xIsCategorical, xAxisDataPoints, tickMaxWidth, xRange, axisPadding, xAxisData.start, xAxisData.end);
        if (height - legendHeight - xAxisHeight - axisPadding < this.ResponsiveMinHeight) {
            xAxisHeight = 0;
        }
        svgContainer.selectAll("svg").remove();

        if ((totalXWidth < this.ResponsiveMinWidth) || plotSize.height - legendHeight - xAxisHeight - axisPadding < this.ResponsiveMinHeight) {
            resultLegendPosition = "None";
        }
        return resultLegendPosition;
    }

    private retrieveAxisPadding(): number {
        return 10;
    }

    private retrieveAxisMargin(): number {
        let longestXAxis: string = null;

        for (let i = 1; i < this.categories.length; i++) {
            let value: PrimitiveValue = this.categoryIsDate ? new Date(this.categories[i].toString()) : this.categories[i];
            let item: string = this.xFormatter.format(value);
            if (longestXAxis == null || item.length > longestXAxis.length)
                longestXAxis = item;
        }
        let xAxisFontSize = this.settings.xAxis.fontSize.toString() + "px";
        let xAxisWidth: number = measureTextWidth({
            fontSize: xAxisFontSize,
            fontFamily: this.settings.xAxis.fontFamily,
            text: longestXAxis
        });

        return xAxisWidth / 2;
    }

    private retrieveYAxisWidth(lines: LineDataPoint[], svgContainer: d3Selection<SVGElement>): number {
        let yAxisWidth = 0;
        if (this.settings.yAxis.show) {
            let yAxisFontSize = this.settings.yAxis.fontSize + "px";

            let domainY: VisualDomain = this.retrieveDomainY(lines);
            let yScale: number[] = d3scaleLinear()
                .domain([domainY.end, domainY.start])
                .nice()
                .ticks();
            for (let i = 0; i < yScale.length; i++) {
                let yValue: string = this.yFormatter ? this.yFormatter.format(yScale[i]) : yScale[i].toString();
                let currentYValueLength: number = measureTextWidth({
                    fontSize: yAxisFontSize,
                    fontFamily: this.settings.yAxis.fontFamily,
                    text: yValue
                });
                if (currentYValueLength > yAxisWidth)
                    yAxisWidth = currentYValueLength;
            }
            yAxisWidth = yAxisWidth + 5;
            if (this.settings.yAxis.showTitle) {
                let titleHeight: number = this.retrieveYAxisTitleHeight(svgContainer);
                yAxisWidth = yAxisWidth + titleHeight;
            }
        }
        return yAxisWidth;
    }

    private retrieveYAxisTitleHeight(svgContainer: d3Selection<SVGElement>): number {
        let titleCont: d3Selection<any> = svgContainer.append("g");
        let titleText: string = this.retrieveYAxisTitleText();
        titleCont.append("text")
            .attr('font-family', this.settings.yAxis.titleFontFamily)
            .attr('font-size', this.settings.yAxis.titleFontSize + "px")
            .attr('fill', this.settings.yAxis.axisTitleColor)
            .text(titleText);
        let n = <any>titleCont.node();
        let titleHeight: number = n.getBBox().height;
        titleCont.remove();
        return titleHeight;
    }

    private retrieveYAxisTitleText(): string {
        let titleText: string = this.settings.yAxis.axisTitle ? this.settings.yAxis.axisTitle : this.valuesName;
        let titleStyle: string = (this.settings.yAxis.displayUnits == 1000 || this.settings.yAxis.displayUnits == 1000000 ||
            this.settings.yAxis.displayUnits == 1000000000 || this.settings.yAxis.displayUnits == 1000000000000)
            ? this.settings.yAxis.titleStyleFull
            : this.settings.yAxis.titleStyle;
        switch (titleStyle) {
            case "showUnitOnly": {
                titleText = this.retrieveXDisplayUnitsForTitle(this.settings.yAxis.displayUnits);
                break;
            }
            case "showBoth": {
                let displayUnits: string = this.retrieveXDisplayUnitsForTitle(this.settings.yAxis.displayUnits);
                titleText = titleText + " (" + displayUnits + ")";
                break;
            }
        }
        return titleText;
    }

    private retrieveXRange(yAxisWidth: number, axisPadding: number, axisMargin: number, width: number): number[] {
        let xRange: number[];
        if (this.settings.yAxis.position == AxisPosition.Left) {
            xRange = [yAxisWidth + axisPadding + axisMargin, width - axisMargin];
        } else {
            xRange = [axisMargin, width - axisMargin - axisPadding - yAxisWidth];
        }
        if (xRange[1] < xRange[0]) {
            let n: number = xRange[0];
            xRange[0] = xRange[1];
            xRange[1] = n;
        }
        return xRange;
    }

    private retrieveXData(
        xIsCategorical: boolean,
        lines: LineDataPoint[],
        xAxisDataPoints: PrimitiveValue[],
        xRange: number[]): XAxisData {
        let x: AxisScale<AxisDomain>;
        //set x
        let chartRangeType: string = this.settings.xAxis.chartRangeType;
        console.log(chartRangeType)

        let start: number;
        let end: number;

        console.log(this.categoryIsDate)
        if (this.categoryIsDate) {
            let lastIndex: number = this.categories.length - 1;
            let minDate: Date = new Date(this.categories[0].toString());
            let maxDate: Date = new Date(this.categories[lastIndex].toString());
            if (chartRangeType == "separate") {
                minDate = null;
                maxDate = null;
                for (let i = 0; i < lines.length; i++) {
                    let lineDataPoint: LineDataPoint = lines[i];
                    if (lineDataPoint.points) {
                        for (let j = 0; j < lineDataPoint.points.length; j++) {
                            let item: Date = lineDataPoint.points[j].x as Date;
                            if (minDate == null || item < minDate)
                                minDate = item;
                            if (maxDate == null || item > maxDate)
                                maxDate = item;
                        }
                    }
                }
                let newxAxisDataPoints: Date[] = [];
                let keys: string[] = []
                for (let i = 0; i < xAxisDataPoints.length; i++) {
                    let item: Date = xAxisDataPoints[i] as Date;
                    let itemKey: string = this.convertCategoryItemToString(item);
                    if ((minDate <= item) && (item <= maxDate) && (keys.indexOf(itemKey) == -1)) {
                        keys.push(itemKey);
                        newxAxisDataPoints.push(item);
                    }
                    if (item > maxDate)
                        break;
                }
                xAxisDataPoints = newxAxisDataPoints;
            }
            if (xIsCategorical) {
                x = d3scalePoint(xAxisDataPoints as AxisDomain[], xRange);
            } else {
                x = d3scaleTime([minDate, maxDate], xRange);
            }
        } else {
            if (this.categoryIsScalar) {
                chartRangeType = this.settings.xAxis.chartRangeTypeForScalarAxis;
                let lastIndex: number = this.categories.length - 1;
                switch (chartRangeType) {
                    case "custom": {
                        let startFormatted: number = (this.settings.xAxis.start != null) ? this.settings.xAxis.start : this.retrieveFormattedXValue(+this.categories[0]);
                        let endFormatted: number = (this.settings.xAxis.end != null) ? this.settings.xAxis.end : this.retrieveFormattedXValue(+this.categories[lastIndex]);
                        let precision = this.retrievexFormatPrecision();
                        start = startFormatted * precision;
                        end = endFormatted * precision;
                        lines = this.changeLinesForStartAndEndXAxis(lines, start, end);
                        let newxAxisDataPoints: number[] = [];
                        for (let i = 0; i < xAxisDataPoints.length; i++) {
                            let item: number = +xAxisDataPoints[i];
                            if ((start <= item) && (item <= end) && (newxAxisDataPoints.indexOf(item) == -1)) {
                                newxAxisDataPoints.push(xAxisDataPoints[i] as number);
                            }
                        }
                        xAxisDataPoints = newxAxisDataPoints;
                        break;
                    }
                    case "separate": {
                        start = null;
                        end = null;
                        for (let i = 0; i < lines.length; i++) {
                            let lineItem: LineDataPoint = lines[i];
                            if (lineItem.points)
                                for (let j = 0; j < lineItem.points.length; j++) {
                                    let pointX: number = +lineItem.points[j].x;
                                    if (start == null || pointX <= start)
                                        start = pointX;
                                    if (end == null || pointX >= end)
                                        end = pointX;
                                }
                        }
                        break;
                    }
                    case "common": {
                        start = +this.categories[0];
                        end = +this.categories[lastIndex];
                        break;
                    }
                }
            }

            console.log('chartRangeType')
            console.log(chartRangeType)
            if (chartRangeType == "separate") {
                let newxAxisDataPoints: any[] = [];
                for (let k = 0; k < xAxisDataPoints.length; k++) {
                    let item: string = this.convertCategoryItemToString(xAxisDataPoints[k]);
                    let isExisted: boolean = false;
                    for (let i = 0; i < lines.length; i++) {
                        let lineItem: LineDataPoint = lines[i];
                        if (lineItem.points)
                            for (let j = 0; j < lineItem.points.length; j++) {
                                let pointX: string = this.convertCategoryItemToString(lineItem.points[j].x);
                                if (pointX == item) {
                                    isExisted = true;
                                    break;
                                }
                            }
                        if (isExisted == true)
                            break;
                    }
                    if (isExisted)
                        newxAxisDataPoints.push(xAxisDataPoints[k]);
                }
                xAxisDataPoints = newxAxisDataPoints;
            }

            console.log('xIsCategorical')
            console.log(xIsCategorical)
            if (xIsCategorical) {
                x = d3scalePoint(xAxisDataPoints as AxisDomain[], xRange)
            } else {
                if (start <= 0)
                    this.settings.xAxis.axisScale = "linear";
                if (this.settings.xAxis.axisScale == "linear") {
                    x = d3scaleLinear([start, end], xRange);
                } else {
                    if (chartRangeType != "custom" && end / this.MaxLogScaleDivider <= start)
                        start = start / this.MaxLogScaleDivider;
                    x = d3scaleLog([start, end], xRange);
                }
            }
        }

        console.log('xAxisDataPoints')
        console.log(xAxisDataPoints)

        if (xAxisDataPoints.length == 1) {
            x = d3scalePoint(xAxisDataPoints as AxisDomain[], xRange);
        }


        // // TODO Remove test
        // x = d3scalePoint(xAxisDataPoints as AxisDomain[], xRange);
        // console.log('test')
        // console.log(x('Feb-14'))

        return {
            x: x,
            xAxisDataPoints: xAxisDataPoints,
            lines: lines,
            start: start,
            end: end
        };
    }

    private retrieveResponsiveIcon(svgContainer: d3Selection<SVGElement>) {
        let svgAxisContainer: d3Selection<SVGElement> = svgContainer
            .append('svg')
            .attr('width', "100%")
            .attr('height', "100%")
            .attr('viewBox', "0 0 24 24");
        let g = svgAxisContainer.append('g').attr('fill', '#333');
        g.append("path")
            .attr("d", "M12,16.5703125 L13.140625,16.5703125 L13.140625,10.859375 L12,10.859375 L12,16.5703125 Z M10.8515625,9.7109375 L14.28125,9.7109375 L14.28125,17.7109375 L10.8515625,17.7109375 L10.8515625,9.7109375 Z M7.421875,16.5703125 L8.5703125,16.5703125 L8.5703125,8.5703125 L7.421875,8.5703125 L7.421875,16.5703125 Z M6.28125,7.4296875 L9.7109375,7.4296875 L9.7109375,17.7109375 L6.28125,17.7109375 L6.28125,7.4296875 Z M16.5703125,16.5703125 L17.7109375,16.5703125 L17.7109375,6.28125 L16.5703125,6.28125 L16.5703125,16.5703125 Z M15.421875,5.140625 L18.8515625,5.140625 L18.8515625,17.7109375 L15.421875,17.7109375 L15.421875,5.140625 Z M5.140625,4 L5.140625,18.859375 L20,18.859375 L20,20 L4,20 L4,4 L5.140625,4 Z");
    }

    public retrieveMaxCountOfXAxis(lines: LineDataPoint[]): number {
        let xAxisData: XAxisData = this.retrieveXData(true, lines, this.categories, [0, 0]);
        return xAxisData.xAxisDataPoints.length;
    }

    public renderSmallMultiple(svgContainer: d3Selection<SVGElement>, lines: LineDataPoint[], width: number, height: number, lineKey: string,
                               isResponsive: boolean, legendHeight: number, isLegendHidden: boolean, rectGlobalX: number, rectGlobalY: number) {
        console.log('renderSmallMultiple')
        svgContainer.classed(Visual.SmallMultipleSelector.className, true);
        svgContainer = svgContainer.append("svg");
        let plotSize = {width: width, height: height};

        let axisPadding: number = this.retrieveAxisPadding();
        let yAxisWidth = this.retrieveYAxisWidth(lines, svgContainer);
        let yAxisFontSize = this.settings.yAxis.fontSize + "px";
        let axisMargin: number = this.retrieveAxisMargin();

        let showYAxis: boolean = true;
        let totalXWidth: number = width - yAxisWidth - axisPadding - 2 * axisMargin;

        if (totalXWidth < this.ResponsiveMinWidth) {
            yAxisWidth = plotSize.width - this.ResponsiveMinWidth - axisPadding - 2 * axisMargin;
            let minYAxisWidth: number = measureTextWidth({
                fontSize: yAxisFontSize,
                fontFamily: this.settings.yAxis.fontFamily,
                text: "..."
            });
            if (yAxisWidth < minYAxisWidth) {
                if (isResponsive) {
                    showYAxis = false;
                    axisPadding = 0;
                    axisMargin = 5;
                    yAxisWidth = 0;
                } else {
                    yAxisWidth = minYAxisWidth;
                }
            }
        }

        totalXWidth = width - yAxisWidth - axisPadding - 2 * axisMargin;

        //X
        let xAxisDataPoints: any[] = this.categories;
        let xRange: number[] = this.retrieveXRange(yAxisWidth, axisPadding, axisMargin, width);
        let xIsCategorical: boolean = (this.settings.xAxis.axisType === 'categorical');
        let xAxisData: XAxisData = this.retrieveXData(xIsCategorical, lines, xAxisDataPoints, xRange);
        console.log(xAxisData)

        let x = xAxisData.x;
        xAxisDataPoints = xAxisData.xAxisDataPoints;
        lines = xAxisData.lines;

        let tickMaxWidth = xAxisDataPoints.length > 0
            ? ((xRange[1] - xRange[0]) / xAxisDataPoints.length)
            : 0;
        let xAxisHeight = this.renderXAxis(svgContainer, plotSize, x, xIsCategorical, xAxisDataPoints, tickMaxWidth, xRange, axisPadding, xAxisData.start, xAxisData.end);
        // if (isResponsive && (plotSize.height - legendHeight - xAxisHeight - axisPadding < this.ResponsiveMinHeight || isLegendHidden)) {
        //     svgContainer.selectAll("svg").remove();
        //     xAxisHeight = 0;
        //     axisMargin = 5;
        //     //recount
        //     xRange = this.retrieveXRange(yAxisWidth, axisPadding, axisMargin, width);
        //     xAxisData = this.retrieveXData(xIsCategorical, lines, xAxisDataPoints, xRange);
        //     x = xAxisData.x;
        //     xAxisDataPoints = xAxisData.xAxisDataPoints;
        //     lines = xAxisData.lines;
        //     tickMaxWidth = xAxisDataPoints.length > 0
        //         ? ((xRange[1] - xRange[0]) / xAxisDataPoints.length)
        //         : 0;
        // }
        //
        // //Y
        // let yRangeMax: number = isLegendHidden
        //     ? plotSize.height - axisPadding - xAxisHeight + legendHeight
        //     : plotSize.height - axisPadding - xAxisHeight;
        // if (yRangeMax < 0)
        //     yRangeMax = 0;
        //
        // let yRange: number[] = [axisPadding, yRangeMax];
        // let domainY: VisualDomain = this.retrieveDomainY(lines);
        // let y: ScaleContinuousNumeric<number, number>;
        // if (this.settings.yAxis.axisScale == "linear") {
        //     y = d3scaleLinear()
        //         .domain([domainY.end, domainY.start])
        //         .range(yRange).nice().nice();
        // } else {
        //     y = d3scaleLog()
        //         .domain([domainY.end, domainY.start])
        //         .range(yRange);
        // }
        // if (showYAxis)
        //     this.renderYAxis(svgContainer, plotSize, y, domainY, axisPadding, yAxisWidth, yAxisFontSize);
        //
        // if (isResponsive && ((totalXWidth < this.ResponsiveMinWidth) || (plotSize.height - xAxisHeight - axisPadding < this.ResponsiveMinHeight))) {
        //     //draw image
        //     svgContainer.selectAll("svg").remove();
        //     this.retrieveResponsiveIcon(svgContainer);
        //     return;
        // }
        // //Draw line
        // if (lines.length == 0)
        //     return;
        // let line: d3Line<[number, number]> = d3line()
        //     .x(function (d: any) {
        //         return x(d.x);
        //     })
        //     .y(function (d: any) {
        //         return y(d.y);
        //     })
        //     .curve(curveLinear);
        // //prepare vertical line
        // let showVerticalLine: boolean = (tickMaxWidth > 1);
        // let xMouseMin: number;
        // let xMouseMax: number;
        // let hoverContainer: d3Selection<SVGElement>;
        // let tooltipRect: d3Selection<SVGElement>;
        //
        // if (showVerticalLine) {
        //     xMouseMin = xRange[0] - axisMargin;
        //     xMouseMax = xRange[1] + axisMargin;
        //     hoverContainer = svgContainer.append("svg");
        //     tooltipRect = hoverContainer.append('rect')
        //         .classed('clearCatcher', true)
        //         .classed(Visual.LineChartRectSelector.className, true)
        //         .attr('width', xMouseMax - xMouseMin)
        //         .attr('height', yRangeMax)
        //         .attr('x', xMouseMin)
        //         .attr('y', 0)
        //         .attr('opacity', '1e-06')
        //         .attr('fill', '#fff');
        // }
        // //Render lines
        // this.renderLines(svgContainer, lines, plotSize.width, yRangeMax, line);
        //
        // this.renderDataLabels(lines, xMouseMin, xMouseMax, yRangeMax + axisPadding, line, svgContainer);
        // //Render vertical line
        // if (!showVerticalLine) return;
        //
        // let hoverLine: d3Selection<SVGElement> = hoverContainer.append("path") // this is the vertical line to follow mouse
        //     .classed(Visual.HoverLineSelector.className, true)
        //     .style("opacity", 0);
        // let hoverLineData: d3Selection<number> = hoverLine.data([0]);
        //
        // let shapesShowMarkers: boolean = this.settings.shapes.showMarkers;
        // let verticalLineDataItems: VerticalLineDataItem[] = generateVerticalLineData(this.categoryIsDate, this.xFormatter, this.tooltipFormatter,
        //     lines, xAxisDataPoints, line, shapesShowMarkers, rectGlobalX, rectGlobalY);
        //
        // this.verticalLineDataItemsGlobal[lineKey] = {
        //     verticalLineDataItems: verticalLineDataItems,
        //     hoverLineData: hoverLineData
        // };
        //
        // let tooltipServiceWrapper = this.tooltipServiceWrapper;
        // svgContainer.on('mouseout', function () {
        //     tooltipServiceWrapper.hide();
        //     hoverLine.style("opacity", 0);
        //     hoverContainer.selectAll(Visual.CircleSelector.selectorName).remove();
        // });
        // let is: IInteractivityService<any> = this.interactivityService;
        // svgContainer.on('click', function (e: MouseEvent) {
        //     let mouseX: number = e.x;
        //     let mouseY: number = e.y;
        //     if (mouseX < xMouseMin || xMouseMax < mouseX || mouseY > yRangeMax) {
        //         is.clearSelection();
        //     }
        // });
        // svgContainer.on('mousemove', function (e: MouseEvent) {
        //     let mouseX: number = e.x;
        //     let mouseY: number = e.y;
        //     if (mouseX < xMouseMin || xMouseMax < mouseX || mouseY > yRangeMax) {
        //         tooltipServiceWrapper.hide();
        //         hoverLine.style("opacity", 0);
        //         hoverContainer.selectAll(Visual.CircleSelector.selectorName).remove();
        //     } else {
        //         let index: number = findNearestVerticalLineIndex(mouseX, verticalLineDataItems);
        //         hoverLineData = hoverLine.data([index]);
        //         let verticalLineDataItem: VerticalLineDataItem = verticalLineDataItems[index];
        //         if (verticalLineDataItem) {
        //             let xValue: number = verticalLineDataItem.x;
        //             drawPointsForVerticalLine(hoverContainer, xValue, verticalLineDataItem.linePoints);
        //             let d: string = "M" + xValue + "," + yRangeMax + "V0";
        //             hoverLine.attr("d", d).style("opacity", 1);
        //         }
        //     }
        // });
        // tooltipServiceWrapper.addTooltip(tooltipRect,
        //     () => {
        //         let index: number = hoverLineData.data()[0];
        //         let tooltips: VisualTooltipDataItem[] = null;
        //         if (verticalLineDataItems[index])
        //             tooltips = verticalLineDataItems[index].tooltips;
        //         return tooltips;
        //     },
        //     null,
        //     true);
    };

    private renderXAxis(
        svgContainer: d3Selection<SVGElement>,
        plotSize: any,
        x: AxisScale<AxisDomain>,
        xIsCategorical: boolean,
        xAxisDataPoints: PrimitiveValue[],
        tickMaxWidth: number,
        xRange: number[],
        axisPadding: number,
        start: number,
        end: number): number {
        if (!this.settings.xAxis.show) return 0;
        let svgAxisContainer: d3Selection<SVGElement> = svgContainer
            .append('svg');

        let axisSvg = svgAxisContainer
            .selectAll("g.axis")
            .data([0]);

        let xAxisSvg = axisSvg.enter().append("g").attr("class", "x axis");

        let xSpecial = x;
        let numTicks: number;
        let actionWithLabels: LabelsAction = LabelsAction.Simple;

        let longestXAxis: string = null;

        for (let i = 1; i < xAxisDataPoints.length; i++) {
            let value: PrimitiveValue = this.categoryIsDate ? new Date(xAxisDataPoints[i].toString()) : xAxisDataPoints[i];
            let item: string = this.xFormatter.format(value);
            if (longestXAxis == null || item.length > longestXAxis.length)
                longestXAxis = item;
        }

        let xAxisFontSize = this.settings.xAxis.fontSize.toString() + "px";
        let xAxisWidth: number = measureTextWidth({
            fontSize: xAxisFontSize,
            fontFamily: this.settings.xAxis.fontFamily,
            text: longestXAxis
        });

        console.log('xIsCategorical')
        console.log(xIsCategorical)

        if (xIsCategorical) {
            numTicks = xAxisDataPoints.length;
            let fontWidth = this.settings.xAxis.fontSize;

            if (tickMaxWidth < fontWidth) {
                actionWithLabels = LabelsAction.Rotate90;
                numTicks = xAxisDataPoints.length;
                xSpecial = d3scalePoint(xAxisDataPoints as AxisDomain[], xRange);
            } else if (tickMaxWidth < 1.9 * fontWidth) {
                actionWithLabels = LabelsAction.Rotate90;

            } else if (tickMaxWidth < 1.1 * xAxisWidth) {
                actionWithLabels = LabelsAction.Rotate35;
            }
        } else {
            let divider: number = 1.8 * xAxisWidth;
            numTicks = Math.floor((xRange[1] - xRange[0]) / divider);
            if (numTicks < 2)
                numTicks = 2;
            if (numTicks > xAxisDataPoints.length)
                numTicks = xAxisDataPoints.length;
            if (numTicks == 1 && this.settings.xAxis.axisScale == "linear")
                xSpecial = d3scalePoint(xAxisDataPoints as AxisDomain[], xRange);
        }

        let xAxis = (this.categoryIsDate)
            ? d3axisBottom(xSpecial).ticks(numTicks).tickSize(0)
            : ((this.settings.xAxis.axisScale == "log")
                ? d3axisBottom(xSpecial)
                : d3axisBottom(xSpecial).ticks(numTicks).tickSize(0));

        if (this.categoryIsDate) {
            if (xIsCategorical) {
                xAxis.tickFormat(d => this.xFormatter.format(d));
            }
            xAxisSvg.call(xAxis);
        } else {
            if (this.categoryIsScalar) {
                xAxis.tickFormat(d => this.xFormatter.format(d));
            }
            xAxisSvg.call(xAxis.scale(xSpecial));
        }

        xAxisSvg.selectAll('.domain').remove();

        let labels = xAxisSvg.selectAll('text')
            .style('fill', this.settings.xAxis.axisColor)
            .style('font-family', this.settings.xAxis.fontFamily,)
            .style('font-size', xAxisFontSize);

        switch (actionWithLabels) {
            case LabelsAction.Simple: {
                let count: number = (labels.data().length == 0)
                    ? 1
                    : labels.data().length;
                if (this.settings.xAxis.axisScale == "linear") {
                    let tickMaxWidth = (xRange[1] - xRange[0]) / count;
                    labels.call(wrapAxis, tickMaxWidth, {
                        fontFamily: this.settings.xAxis.fontFamily,
                        fontSize: xAxisFontSize
                    });
                } else {
                    let labelXArray: number[] = [];
                    labels.each((number: any, index: number) => {
                        let item: d3Selection<any> = d3select(labels[0][index]);
                        let parent: d3Selection<any> = d3select(item.node().parentElement);
                        let numberValue: number = number;
                        if (numberValue < 1) {
                            while (numberValue < 1) {
                                numberValue = numberValue * this.MaxLogScaleDivider;
                            }
                        } else {
                            while (numberValue > 1) {
                                numberValue = numberValue / this.MaxLogScaleDivider;
                            }
                        }
                        if (end / start > this.MaxLogScaleDivider && numberValue != 1) {
                            item.text("");
                            parent.select('line').remove();
                        } else {
                            let transform: string = parent.attr('transform');
                            let labelX: number = +transform.replace('translate(', '').split(',')[0];
                            labelXArray.push(labelX);
                            item.text(this.xFormatter.format(number));
                        }
                    });
                    for (let i = 0; i < labelXArray.length - 1; i++) {
                        labelXArray[i] = labelXArray[i + 1] - labelXArray[i];
                    }
                    labelXArray[labelXArray.length - 1] = plotSize.width - labelXArray[labelXArray.length - 1];
                    let labelIndex: number = 0;
                    labels.each((number: any, index: number) => {
                        let item: d3Selection<any> = d3select(labels[0][index]);
                        let textTitle: string = item.text();
                        if (textTitle) {
                            let textProp: TextProperties = {
                                text: textTitle,
                                fontFamily: this.settings.xAxis.fontFamily,
                                fontSize: xAxisFontSize
                            };
                            let maxTextWidth: number = labelXArray[labelIndex];
                            labelIndex = labelIndex + 1;
                            let text: string = getTailoredTextOrDefault(textProp, maxTextWidth);
                            item.text(text).append('title').text(textTitle);
                        }
                    });
                }
                break;
            }
            case LabelsAction.Rotate35: {
                labels.attr("transform", function (d) {
                    return "translate(" + (<any>this).getBBox().height * -2 + "," + (<any>this).getBBox().height + ")rotate(-35)";
                }).attr('dy', '0').attr('dx', '2.5em').style("text-anchor", "end")
                    .call(truncateAxis, plotSize.height * this.settings.xAxis.maximumSize / 100, {
                        fontFamily: this.settings.xAxis.fontFamily,
                        fontSize: xAxisFontSize
                    });
                break;
            }
            case LabelsAction.Rotate90: {
                labels.attr("transform", "rotate(-90)")
                    .attr('dy', '-0.5em')
                    .style("text-anchor", "end")
                    .call(truncateAxis, plotSize.height * this.settings.xAxis.maximumSize / 100, {
                        fontFamily: this.settings.xAxis.fontFamily,
                        fontSize: xAxisFontSize
                    });
                let labelStartX: number = null;
                let removedIndexes: number[] = [];
                labels.each((number: any, index: number) => {
                    let item: d3Selection<any> = d3select(labels.nodes()[index]);
                    let parent: d3Selection<any> = d3select(item.node().parentElement);
                    let transform: string = parent.attr('transform');
                    let labelX: number = +transform.replace('translate(', '').split(',')[0];
                    if (labelStartX == null) {
                        labelStartX = labelX;
                    } else {
                        if (labelX - labelStartX < this.settings.xAxis.fontSize)
                            removedIndexes.push(index);
                        else
                            labelStartX = labelX;
                    }
                });
                for (let i = 0; i < removedIndexes.length; i++) {
                    let index = removedIndexes[i];
                    let item: d3Selection<any> = d3select(labels.nodes()[index]);
                    item.remove();
                }
                break;
            }
        }

        let n = <any>xAxisSvg.node();
        let xAxisHeight: number = n.getBBox().height;

        if (this.settings.xAxis.showTitle) {
            let titleTextFull: string = this.settings.xAxis.axisTitle ? this.settings.xAxis.axisTitle : this.categoryName;
            let titleStyle: string = (this.categoryIsScalar && (this.settings.xAxis.displayUnits == 1000 ||
                this.settings.xAxis.displayUnits == 1000000 || this.settings.xAxis.displayUnits == 1000000000 || this.settings.xAxis.displayUnits == 1000000000000))
                ? this.settings.xAxis.titleStyleFull
                : this.settings.xAxis.titleStyle;
            switch (titleStyle) {
                case "showUnitOnly": {
                    titleTextFull = this.retrieveXDisplayUnitsForTitle(this.settings.xAxis.displayUnits);
                    break;
                }
                case "showBoth": {
                    let displayUnits: string = this.retrieveXDisplayUnitsForTitle(this.settings.xAxis.displayUnits);
                    titleTextFull = titleTextFull + " (" + displayUnits + ")";
                    break;
                }
            }

            let titleFontSize: string = this.settings.xAxis.titleFontSize + "px";
            let textProp: TextProperties = {
                text: titleTextFull,
                fontFamily: this.settings.xAxis.titleFontFamily,
                fontSize: titleFontSize,
            };
            let titleText: string = getTailoredTextOrDefault(textProp, xRange[1] - xRange[0]);
            let titleCont: d3Selection<any> = xAxisSvg.append("g");
            titleCont.append("text")
                .attr('font-family', this.settings.xAxis.titleFontFamily)
                .attr('font-size', titleFontSize)
                .attr('fill', this.settings.xAxis.axisTitleColor)
                .attr('text-anchor', 'middle')
                .text(titleText)
                .append('title').text(titleTextFull);

            n = <any>titleCont.node();
            let titleHeight: number = n.getBBox().height;

            let titleX: number = (xRange[1] + xRange[0]) / 2;
            let delta: number = (titleHeight - this.settings.xAxis.titleFontSize) / 2;
            let titleY: number = xAxisHeight + titleHeight - delta;
            titleCont.attr('transform', 'translate(' + titleX + ',' + titleY + ')');
            xAxisHeight = xAxisHeight + titleHeight + delta;
        }
        xAxisSvg.attr('transform', 'translate(0,' + (plotSize.height - xAxisHeight) + ')');

        if (this.settings.xAxis.showGridlines) {
            let grid = svgAxisContainer.selectAll("g.x.axis").data([0]);
            let strokeDasharray = getLineStyleParam(this.settings.xAxis.lineStyle);
            grid.selectAll('line')
                .attr("y2", -plotSize.height + xAxisHeight + axisPadding)
                .style("stroke", this.settings.xAxis.gridlinesColor)
                .style("stroke-width", this.settings.xAxis.strokeWidth)
                .style("stroke-dasharray", strokeDasharray);
        }

        return xAxisHeight;
    }

    private renderYAxis(svgContainer: d3Selection<SVGElement>, plotSize: any, y: any, domainY: VisualDomain, axisPadding: number, yAxisWidth: number, yAxisFontSize: string) {
        // if (!this.settings.yAxis.show) return;
        // let yAxis: d3.svg.Axis;
        // //format axis for its' position
        // if (this.settings.yAxis.position == AxisPosition.Left) {
        //     yAxis = d3.svg.axis().tickPadding(axisPadding)
        //         .innerTickSize(plotSize.width - yAxisWidth - axisPadding)
        //         .ticks(Math.max(Math.floor(plotSize.height / 80), 2)).orient("left");
        // } else {
        //     yAxis = d3.svg.axis().tickPadding(axisPadding)
        //         .innerTickSize(plotSize.width)
        //         .outerTickSize(yAxisWidth + axisPadding)
        //         .ticks(Math.max(Math.floor(plotSize.height / 80), 2)).orient("left");
        // }
        // let yFormatter = this.yFormatter;
        // if (yFormatter) yAxis.tickFormat(function (d) {
        //     return yFormatter.format(d);
        // });
        //
        // let svgAxisContainer: Selection<SVGElement> = svgContainer
        //     .append('svg')
        //     .attr('width', plotSize.width);
        //
        // let axis = svgAxisContainer.selectAll("g.axis").data([1]);
        //
        // axis.enter().append("g")
        //     .attr("class", "y axis")
        //     .attr('transform', 'translate(' + plotSize.width + ',0)');
        //
        // axis.call(yAxis.scale(y));
        // svgAxisContainer.selectAll(".domain").remove();
        // let labels: UpdateSelection<number> = axis.selectAll('text').style({
        //     'fill': this.settings.yAxis.axisColor,
        //     'font-family': this.settings.yAxis.fontFamily,
        //     'font-size': yAxisFontSize
        // });
        // if (this.settings.yAxis.axisScale == "linear") {
        //     labels.call(TextUtility.wrapAxis, yAxisWidth, {
        //         fontFamily: this.settings.xAxis.fontFamily,
        //         fontSize: yAxisFontSize
        //     });
        // } else {
        //     if (domainY.end / domainY.start > this.MaxYLogScaleShowDivider) {
        //         labels.each((number: any, index: number) => {
        //             let item: Selection<any> = d3.select(labels[0][index]);
        //             let parent: Selection<any> = d3.select(item.node().parentElement);
        //             let numberValue: number = number;
        //             if (numberValue < 1) {
        //                 while (numberValue < 1) {
        //                     numberValue = numberValue * this.MaxLogScaleDivider;
        //                 }
        //             } else {
        //                 while (numberValue > 1) {
        //                     numberValue = numberValue / this.MaxLogScaleDivider;
        //                 }
        //             }
        //             if (numberValue != 1) {
        //                 item.text("");
        //                 parent.select('line').remove();
        //             }
        //         });
        //     }
        // }
        //
        // //format gridlines
        // let yAxisGridlinesStrokeWidth = (this.settings.yAxis.showGridlines) ? this.settings.yAxis.strokeWidth : 0;
        // let strokeDasharray = VizUtility.getLineStyleParam(this.settings.yAxis.lineStyle);
        // axis.selectAll('line').style({
        //     "stroke": this.settings.yAxis.gridlinesColor,
        //     "stroke-width": yAxisGridlinesStrokeWidth,
        //     "stroke-dasharray": strokeDasharray
        // });
        //
        // //format axis for its' position
        // let titleHeight: number = (this.settings.yAxis.showTitle) ? this.retrieveYAxisTitleHeight(svgContainer) : 0;
        // if (this.settings.yAxis.position == AxisPosition.Right) {
        //     let textTranslate = plotSize.width - titleHeight;
        //     axis.selectAll('text').attr('transform', 'translate(' + textTranslate + ',0)');
        //     let lineTranslate = yAxisWidth + axisPadding;
        //     axis.selectAll('line').attr('transform', 'translate(-' + lineTranslate + ',0)');
        // }
        // if (this.settings.yAxis.showTitle) {
        //     let titleTextFull: string = this.retrieveYAxisTitleText();
        //     let titleFontSize: string = this.settings.yAxis.titleFontSize + "px";
        //     let textProp: TextProperties = {
        //         text: titleTextFull,
        //         fontFamily: this.settings.yAxis.titleFontFamily,
        //         fontSize: titleFontSize,
        //     };
        //     let titleText: string = TextUtility.getTailoredTextOrDefault(textProp, plotSize.height);
        //
        //     let translateX: number;
        //     let transform: string;
        //     translateX = titleHeight - axisPadding < axisPadding ? axisPadding : titleHeight - axisPadding;
        //     if (this.settings.yAxis.position == AxisPosition.Right) {
        //         translateX = -translateX + plotSize.width;
        //         ;
        //         transform = 'rotate(90)';
        //     } else {
        //         transform = 'rotate(-90)';
        //     }
        //     let translateY: number = plotSize.height / 2;
        //     svgAxisContainer.append("g").attr('transform', 'translate(' + translateX + ',' + translateY + ')')
        //         .append("text")
        //         .attr({
        //             'transform': transform,
        //             'font-family': this.settings.yAxis.titleFontFamily,
        //             'font-size': titleFontSize,
        //             'fill': this.settings.yAxis.axisTitleColor,
        //             'text-anchor': 'middle'
        //         })
        //         .text(titleText)
        //         .append('title').text(titleTextFull);
        // }
    }

    private retrieveFormattedXValue(x: number): number {
        let xFormatted: number = +this.xFormatter.format(x).replace(/[^.0-9]/g, '');
        return xFormatted;
    }

    private retrieveXDisplayUnitsForTitle(displayUnits: number): string {
        let displayUnitsText: string = "No Units";
        switch (displayUnits) {
            case 1000: {
                displayUnitsText = "Thousands";
                break;
            }
            case 1000000: {
                displayUnitsText = "Millions";
                break;
            }
            case 1000000000: {
                displayUnitsText = "Billions";
                break;
            }
            case 1000000000000: {
                displayUnitsText = "Trillions";
                break;
            }
        }
        return displayUnitsText;
    }

    private retrievexFormatPrecision(): number {
        let precision: number = 1;
        if (this.categoryIsScalar) {
            let customFormatter: IValueFormatter = Formatter.getFormatter({
                format: this.xFormatter.options.format,
                value: 0,
                precision: null,
                displayUnitSystemType: 0,
                cultureSelector: this.xFormatter.options.cultureSelector
            });
            let simpleFormatX: string = customFormatter.format(1);
            let x: number = +simpleFormatX.replace(/[^.0-9]/g, '');
            precision = 1 / x;
        }
        return precision;
    }

    private changeLinesForStartAndEndXAxis(lines: LineDataPoint[], start: number, end: number): LineDataPoint[] {
        for (let i = 0; i < lines.length; i++) {
            let lineItem: LineDataPoint = lines[i];
            let newPoints: any[] = [];
            let keys: string[] = [];
            if (lineItem.points)
                for (let j = 0; j < lineItem.points.length; j++) {
                    let point: any = lineItem.points[j];
                    let x: number = +point.x;
                    if (start <= x && x <= end && keys.indexOf(point.x) == -1) {
                        keys.push(point.x);
                        newPoints.push(point);
                    }
                }
            lines[i].points = newPoints;
        }
        return lines;
    }

    public retrieveDomainY(lines: LineDataPoint[]): VisualDomain {
        let start: number = null;
        let end: number = null;
        let startForced: boolean = false;
        let endForced: boolean = false;
        if (this.isSeparateDomainY) {
            for (let i = 0; i < lines.length; i++) {
                let points: any[] = lines[i].points;
                for (let j = 0; j < points.length; j++) {
                    let yValue = points[j].y;
                    if (yValue < start || start == null)
                        start = yValue;
                    if (end < yValue || end == null)
                        end = yValue;
                }
            }
        } else {
            start = this.domainY.start;
            end = this.domainY.end;
            startForced = this.domainY.startForced;
            endForced = this.domainY.endForced;
        }
        if (start <= 0)
            this.settings.yAxis.axisScale = "linear";
        if (this.settings.yAxis.axisScale == "linear") {
            if (start == end) {
                let delta: number = Math.abs(start / 2);
                if (delta < 1)
                    delta = 1;
                start = start - delta;
                end = end + delta;
            }
        } else {
            if (this.settings.yAxis.chartRangeType != "custom" && end / this.MaxYLogScaleShowDivider <= start)
                start = start / this.MaxLogScaleDivider;
        }
        let domainY: VisualDomain = {
            start: start,
            end: end,
            startForced: startForced,
            endForced: endForced
        };
        return domainY;
    }

    private renderLines(svgContainer: d3Selection<SVGElement>, lines: LineDataPoint[], width: number, height: number, line: d3Line<[number, number]>) {
        //Trend lines
        let svgLinesContainer: d3Selection<SVGElement> = svgContainer
            .append('svg')
            .attr('width', width)
            .attr('height', height);
        let lineGroupSelection: d3Selection<LineDataPoint> = svgLinesContainer
            .selectAll(Visual.SimpleLineSelector.selectorName)
            .data(lines);

        lineGroupSelection
            .enter()
            .append("path")
            .classed(Visual.SimpleLineSelector.className, true);

        let shapes = this.settings.shapes;
        let hasSelection = this.hasSelection;
        let lineDD: string[] = [];
        for (let i = 0; i < lines.length; i++) {
            let dataPoint: LineDataPoint = lines[i];
            let points: any = dataPoint.points;
            let lineD: string = line(points);
            lineDD.push(lineD);
        }
        let lineNamesWithMarkers = RenderVisual.retrieveLineNamesWithMarkers(svgContainer, svgLinesContainer, lineDD, this.settings.shapes, lines);
        lineGroupSelection
            .attr("d", (dataPoint: LineDataPoint, index: number) => {
                let lineD = lineDD[index];
                let stepped: boolean = (dataPoint.stepped == undefined) ? this.settings.shapes.stepped : dataPoint.stepped;
                let dataLine: string = (stepped)
                    ? MarkersUtility.getDataLineForForSteppedLineChart(lineD)
                    : lineD
                return dataLine;
            })
            .attr("stroke", (dataPoint: LineDataPoint) => {
                return dataPoint.color;
            })
            .attr('stroke-width', (dataPoint: LineDataPoint) => {
                let strokeWidth: number = (dataPoint.strokeWidth == undefined) ? this.settings.shapes.strokeWidth : dataPoint.strokeWidth;
                return strokeWidth;
            })
            .attr("stroke-linejoin", (dataPoint: LineDataPoint) => {
                let strokeLineJoin: string = (dataPoint.strokeLineJoin == undefined) ? this.settings.shapes.strokeLineJoin : dataPoint.strokeLineJoin;
                return strokeLineJoin;
            })
            .attr("stroke-dasharray", (dataPoint: LineDataPoint) => {
                let strokeDasharray: string = (dataPoint.lineStyle == undefined) ?
                    getLineStyleParam(this.settings.shapes.lineStyle) :
                    getLineStyleParam(dataPoint.lineStyle);
                return strokeDasharray;
            })
            .attr('fill', 'none')
            .style("opacity", (dataPoint: LineDataPoint) => {
                let opacity: number = getOpacity(dataPoint.selected, hasSelection);
                let showMarkers: boolean = dataPoint.showMarkers != null
                    ? dataPoint.showMarkers
                    : shapes.showMarkers;
                let stepped: boolean = dataPoint.stepped != null
                    ? dataPoint.stepped
                    : shapes.stepped;
                if (showMarkers && stepped) {
                    let markerPathId: string = MarkersUtility.retrieveMarkerName(dataPoint.lineKey, Visual.MarkerLineSelector.className);
                    svgLinesContainer.selectAll('#' + markerPathId).style("opacity", opacity);
                }
                return opacity;
            });
        for (let i = 0; i < lines.length; i++) {
            let dataPoint: LineDataPoint = lines[i];
            let marker: string = lineNamesWithMarkers[dataPoint.name];
            if (marker) {
                let item: d3Selection<any> = d3select(lineGroupSelection[0][i]);
                item.attr('marker-start', marker);
                item.attr('marker-mid', marker);
                item.attr('marker-end', marker);
            }
        }
        lineGroupSelection.exit().remove();
        let dots: LineDataPoint[] = [];
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].points && lines[i].points.length == 1)
                dots.push(lines[i]);
        }
        let dotsGroupSelection: d3Selection<LineDataPoint> = svgLinesContainer
            .append("g")
            .selectAll(Visual.SimpleLineSelector.selectorName)
            .data(dots);

        dotsGroupSelection
            .enter()
            .append("circle")
            .classed(Visual.DotSelector.className, true);

        dotsGroupSelection
            .attr('cx', (dataPoint: LineDataPoint) => {
                let points: any = dataPoint.points;
                let lineD: string = line(points);
                let data: string[] = lineD.replace("M", "").replace("Z", "").split(",");
                return data[0];
            })
            .attr('cy', (dataPoint: LineDataPoint) => {
                let points: any = dataPoint.points;
                let lineD: string = line(points);
                let data: string[] = lineD.replace("M", "").replace("Z", "").split(",");
                return data[1];
            })
            .attr('r', (dataPoint: LineDataPoint) => {
                let strokeWidth: number = dataPoint.strokeWidth == undefined
                    ? shapes.strokeWidth
                    : dataPoint.strokeWidth;
                return 2.5 + 0.5 * strokeWidth;
            })
            .style('fill', (dataPoint: LineDataPoint) => {
                return dataPoint.color;
            })
            .style('fill-opacity', (dataPoint: LineDataPoint) => {
                let showMarkers: boolean = (dataPoint.showMarkers == undefined) ? this.settings.shapes.showMarkers : dataPoint.showMarkers;
                return showMarkers ? 0 : 1;
            })
            .style('opacity', (dataPoint: LineDataPoint) => {
                let opacity: number = getOpacity(dataPoint.selected, hasSelection);
                return opacity;
            });

        dotsGroupSelection.exit().remove();

        let interactiveLineGroupSelection = svgLinesContainer
            .selectAll(Visual.InteractivityLineSelector.selectorName)
            .data(lines);

        interactiveLineGroupSelection
            .enter()
            .append("path")
            .classed(Visual.InteractivityLineSelector.className, true);

        interactiveLineGroupSelection
            .attr("d", (dataPoint: LineDataPoint) => {
                let points: any = dataPoint.points;
                let lineD: string = line(points);
                let stepped: boolean = (dataPoint.stepped == undefined) ? this.settings.shapes.stepped : dataPoint.stepped;
                let dataLine: string = (stepped)
                    ? MarkersUtility.getDataLineForForSteppedLineChart(lineD)
                    : lineD
                return dataLine;
            })
            .attr('stroke-width', '10')
            .attr("stroke-linejoin", "round")
            .attr('stroke', 'red')
            .attr('stroke-opacity', '0')
            .attr('fill', 'none');
        interactiveLineGroupSelection.exit().remove();
    }

    private renderDataLabels(lines: LineDataPoint[], minRangeX: number, maxRangeX: number, yRangeMax: number, line: d3Line<[number, number]>, svgContainer: d3Selection<any>): void {

        let dataLabelsBackgroundContext: d3Selection<any> = svgContainer.append('g').classed("labelBackgroundGraphicsContext", true);
        dataLabelsBackgroundContext.selectAll("*").remove();
        dataLabelsBackgroundContext.selectAll("*").remove();

        let dataLabelsContext: d3Selection<any> = svgContainer.append('g').classed("labelGraphicsContext", true);
        dataLabelsContext.selectAll("*").remove();

        let labelSettings = this.settings.dataLabels;

        if (!labelSettings.show) return;

        let dataPoints: SimplePoint[] = [];
        for (let i = 0; i < lines.length; i++) {
            let points: SimplePoint[] = lines[i].points;
            if (points)
                for (let j = 0; j < points.length; j++)
                    dataPoints.push(points[j]);
        }

        let fontSizeInPx: string = fromPoint(labelSettings.fontSize);
        let fontFamily: string = labelSettings.fontFamily;

        let coords: Coordinates[] = [];
        let height: number = fromPointToPixel(labelSettings.fontSize);
        let deltaY: number = 20;
        let labelBackgroundWidthPadding: number = 16.2;
        let labelBackgroundHeightPadding: number = 2;
        let labelBackgroundYShift: number = -fromPointToPixel(labelSettings.fontSize) / 10;
        for (let i = 0; i < dataPoints.length; i++) {
            //init labelCoordinates
            let point: any = [{
                x: dataPoints[i].x,
                y: dataPoints[i].y
            }];
            let lineD: string = line(point);
            let data: string[] = lineD.replace("M", "").replace("Z", "").split(",");
            let value = this.dataLabelFormatter.format(dataPoints[i].y);
            let width: number = measureTextWidth({
                fontFamily: fontFamily,
                fontSize: fontSizeInPx,
                text: value
            });
            let coord: Coordinates = {
                x: +data[0],
                y: +data[1] - deltaY,
                value: value,
                bgWidth: width + labelBackgroundWidthPadding,
                bgHeight: height + labelBackgroundHeightPadding,
                bgX: +data[0] - width / 2 - labelBackgroundWidthPadding / 2,
                bgY: +data[1] - height - labelBackgroundYShift - deltaY
            };
            if (coord.bgX + coord.bgWidth > maxRangeX || coord.bgX < minRangeX || coord.bgY + coord.bgHeight > yRangeMax || coord.bgY < 0) {
                continue;
            }
            let goToBottom: boolean = false;
            for (let j = 0; j < coords.length; j++) {
                let isDataLabelOk: boolean = this.isDataLabelOk(coords[j], coord);
                if (isDataLabelOk) {
                    goToBottom = true;
                    break;
                }
            }
            if (goToBottom) {
                coord.bgY = coord.bgY + deltaY * 2;
                coord.y = coord.y + deltaY * 2;
                if (coord.bgY + coord.bgHeight > yRangeMax) {
                    continue;
                }
            }
            let add: boolean = true;
            for (let j = 0; j < coords.length; j++) {
                let isDataLabelOk: boolean = this.isDataLabelOk(coords[j], coord);
                if (isDataLabelOk) {
                    add = false;
                    break;
                }
            }
            if (add) coords.push(coord);
        }
        let coordsLen: number = coords.length;
        let maxCount: number = (this.settings.xAxis.axisType === "categorical")
            ? coordsLen
            : Math.round((0.1 + 0.009 * this.settings.dataLabels.labelDensity) * coordsLen);
        let newCoords: Coordinates[] = [];
        if (maxCount >= coordsLen) {
            newCoords = coords;
        } else {
            let indexes: number[] = [];
            let k: number = 2;
            while (newCoords.length < maxCount) {
                let j: number = Math.round(coordsLen / k);
                for (let i = 0; i < coordsLen; i = i + j) {
                    if (indexes.indexOf(i) == -1) {
                        indexes.push(i);
                        newCoords.push(coords[i]);
                        if (newCoords.length >= maxCount)
                            break;
                    }
                }
                k = k + 1;
            }
        }

        let labelSelection: d3Selection<Coordinates> = dataLabelsContext
            .selectAll(Visual.Label.selectorName)
            .data(newCoords);

        labelSelection
            .enter()
            .append("svg:text");

        labelSelection
            .classed('label', true)
            .attr('transform', (c: Coordinates) => {
                return 'translate(' + c.x + ',' + c.y + ')';
            })
            .attr('text-anchor', 'middle')
            .style("fill", labelSettings.color)
            .style("font-size", fontSizeInPx)
            .style("font-family", fontFamily)
            .style("pointer-events", "none")
            .style("white-space", "nowrap")
            .text((c: Coordinates) => c.value);

        labelSelection
            .exit()
            .remove();

        if (!labelSettings.showBackground) return;

        let backgroundSelection: d3Selection<Coordinates> = dataLabelsBackgroundContext
            .selectAll(Visual.Label.selectorName)
            .data(newCoords);

        backgroundSelection
            .enter()
            .append("svg:rect");

        let backgroundColor: string = this.settings.dataLabels.backgroundColor;

        backgroundSelection
            .attr('height', d => {
                return d.bgHeight;
            })
            .attr('width', d => {
                return d.bgWidth;
            })
            .attr('x', d => {
                return d.bgX;
            })
            .attr('y', d => {
                return d.bgY;
            })
            .attr('rx', DataLabelR)
            .attr('ry', DataLabelR)
            .attr('fill', backgroundColor);

        let transparency: number = this.settings.dataLabels.transparency;
        backgroundSelection.style("fill-opacity", (100 - transparency) / 100)
            .style("pointer-events", "none");

        backgroundSelection
            .exit()
            .remove();
    }

    private isDataLabelOk(item: Coordinates, coord: Coordinates): boolean {
        let result: boolean = (!((item.bgX + item.bgWidth - DataLabelEps < coord.bgX) || (coord.bgX + coord.bgWidth - DataLabelEps < item.bgX))) &&
            (!((item.bgY + item.bgHeight - DataLabelEps < coord.bgY) || (coord.bgY + coord.bgHeight - DataLabelEps < item.bgY)));
        return result;
    }

    public static retrieveLineNamesWithMarkers(container: d3Selection<any>, svgLinesContainer: d3Selection<any>, lineDD: string[], shapes: Shapes, lines: LineDataPoint[]): {} {
        //init markers
        let lineNamesWithMarkers = {};
        let defsContainer = container.append('defs');
        let shapesShowMarkers: boolean = shapes.showMarkers;
        for (let i = 0; i < lines.length; i++) {
            let lineDataPoint: LineDataPoint = lines[i];
            //Marker
            let showMarkers: boolean = (lineDataPoint.showMarkers == undefined) ? shapesShowMarkers : lineDataPoint.showMarkers;
            if (showMarkers) {
                //init variables for marker
                let markerShape: SeriesMarkerShape = (lineDataPoint.markerShape == undefined) ? shapes.markerShape : lineDataPoint.markerShape;
                let markerSize: number = (lineDataPoint.markerSize == undefined) ? shapes.markerSize : lineDataPoint.markerSize;
                let markerColor: string = (lineDataPoint.markerColor == undefined)
                    ? (shapes.markerColor == "") ? lineDataPoint.color : shapes.markerColor
                    : lineDataPoint.markerColor;
                //init marker
                let markerId: string = MarkersUtility.initMarker(defsContainer, lineDataPoint.name, markerShape, markerSize, markerColor);
                if (markerId) {
                    let stepped: boolean = (lineDataPoint.stepped == undefined) ? shapes.stepped : lineDataPoint.stepped;
                    if (stepped) {
                        let lineD = lineDD[i];
                        let strokeWidth: number = (lineDataPoint.strokeWidth == undefined) ? shapes.strokeWidth : lineDataPoint.strokeWidth;
                        let markerPathId: string = MarkersUtility.retrieveMarkerName(lineDataPoint.lineKey, Visual.MarkerLineSelector.className);
                        MarkersUtility.drawMarkersForSteppedLineChart(svgLinesContainer, lineD, markerPathId, markerId, strokeWidth);
                    } else {
                        lineNamesWithMarkers[lineDataPoint.name] = 'url(#' + markerId + ')';
                    }
                }
            }
        }
        return lineNamesWithMarkers;
    }

    public renderRowTitleForMatrixView(rowContainer: d3Selection<any>, titleHeight: number, maxTextWidth: number, separatorSize: number, titleX: string, i: number, separatorIndex: number) {
        let rowText: d3Selection<any> = rowContainer.append("g");
        rowText.attr('width', titleHeight)
            .attr('height', maxTextWidth)
            .attr('transform', 'translate(0,0)');
        rowText.append('rect')
            .classed('clearCatcher', true)
            .attr('width', titleHeight)
            .attr('height', maxTextWidth);
        let titleFontFamily: string = this.settings.smallMultiple.fontFamily;
        let titleFontSize: string = this.settings.smallMultiple.fontSize + "px";
        let titleTextProp: TextProperties = {
            text: titleX,
            fontFamily: titleFontFamily,
            fontSize: titleFontSize
        };
        let shortTitle: string = getTailoredTextOrDefault(titleTextProp, maxTextWidth - separatorSize * 3 / 2);
        titleTextProp.text = shortTitle;
        let titleWidth: number = measureTextWidth(titleTextProp);
        rowText.append("text")
            .classed(Visual.SmallMultipleNameSelector.className, true)
            .attr("font-family", titleFontFamily)
            .attr("font-size", titleFontSize)
            .attr("fill", this.settings.smallMultiple.smColor)
            .attr('width', titleHeight)
            .attr("x", -maxTextWidth / 2 + separatorSize / 2 - titleWidth / 2)
            .attr("y", titleHeight * 2 / 3)
            .attr("transform", "rotate(-90)")
            .text(shortTitle);
        rowText.append("title").text(titleX);
        if (i > 0)
            RenderVisual.renderSeparatorLine(rowText, 0, -separatorSize / 2, titleHeight, -separatorSize / 2, separatorIndex);
    }

    public static renderSeparatorLine(separatorItem: d3Selection<any>, x1: number, y1: number, x2: number, y2: number, separatorIndex: number) {
        let separatorLine: d3Selection<any> = separatorItem.append('line')
            .attr('x1', x1)
            .attr('y1', y1)
            .attr('x2', x2)
            .attr('y2', y2)
            .style('stroke-width', 1);
        if (separatorIndex) {
            separatorLine.style('stroke', "#aaa");
        }
    }

    private convertCategoryItemToString(categoryItem: PrimitiveValue): string {
        if (!categoryItem) return "";
        let category: string = (this.categoryIsDate)
            ? new Date(categoryItem.toString()).toLocaleDateString()
            : ((this.categoryIsScalar)
                ? this.xFormatter.format(categoryItem).toString()
                : categoryItem.toString());
        return category;
    }
}
