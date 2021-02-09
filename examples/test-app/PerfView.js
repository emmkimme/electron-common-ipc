'use strict';

const perfTests = new PerfTests('view');

var processToMaster;
var transaction = 1;
var generateReportTimer;
var generateReport = false;
var noUpdate = false;
var ipcBus = CreateIpcBusClient();

function doPerformance(type) {
    var bufferSize = 1024 * 1024;
    var memVal = document.querySelector(".memory-value");
    if (memVal) {
        bufferSize = memVal.value;
    }
    startPerformance(type, bufferSize);
}

function startPerformance(type, bufferSize) {
    ++transaction;
    var typeCommandElt = document.querySelector('.typeCommand');
    var testParams =
        {
            transaction,
            typeCommand: typeCommandElt.options[typeCommandElt.selectedIndex].text,
            typeArgs: type,
            bufferSize: bufferSize
        };

    perfTests.doPerformanceTests(testParams);

    processToMaster.send('start-performance-tests', testParams);
    return transaction;
}

var results = new Map;
var delays = [];

function doClear(event) {
    var table = document.getElementById('perfResults');
    while (table.rows.length > 1) {
        table.deleteRow(1);
    }
    results.clear();
    delays = [];
}

function doSave() {
    let cvsLike = [];
    {
        let cvsRow = [];
        cvsRow.push(`Type`);
        cvsRow.push(`Link`);
        cvsRow.push(`Ref`);
        cvsRow.push('Time');
        cvsLike.push(cvsRow);
    }
    delays.forEach((result) => {
        if (result.start && result.stop) {
            let cvsRow = [];
            cvsRow.push(`${result.start.test.typeCommand} ${result.start.test.typeArgs} (${result.start.test.bufferSize})`);
            cvsRow.push(`${result.start.peer.process.type} => ${result.stop.peer.process.type}`);
            cvsRow.push(`${result.start.test.typeCommand} ${result.start.test.typeArgs} (${result.start.test.bufferSize}) ${result.start.peer.process.type} => ${result.stop.peer.process.type}`);
            cvsRow.push(result.delay);
            cvsLike.push(cvsRow);
        }
    });
    processToMaster.send('save-performance-tests', cvsLike);
}


function sendReportToMaster() {
    if (generateReport === false) {
        return;
    }
    generateReport = false;
    doSave();
}

function doTraceEnable(event) {
    ipcBus.send('test-performance-trace', event.currentTarget.checked);
}

function doSort(event) {
    var table = document.getElementById('perfResults');
    while (table.rows.length > 1) {
        table.deleteRow(1);
    }
    delays.forEach((delay) => {
        onIPCBus_TestPerformanceResult(delay);
    })
}

function doAutomaticTests(event) {
    doClear(null);
    let tests = [];
    let baseline = 0;
    let step = 500;
    // [1000000, 2500000, 5000000, 7500000, 10000000].forEach((size, index) => {
    [1000000, 5000000, 10000000].forEach((size, index) => {
        for (let occ = 0; occ < 3; ++occ) {
            tests.push({ size: size, type: 'string', baseline });
            baseline += step;
            tests.push({ size: size, type: 'object', baseline });
            baseline += step;
            tests.push({ size: size, type: 'buffer', baseline });
            baseline += step;
            tests.push({ size: size, type: 'args', baseline });
            baseline += step;
        }
        step += 250;
    });
    var testStepElt = document.querySelector(".test-step");
    for (let i = 0; i < tests.length; ++i) {
        setTimeout(() => {
            testStepElt.value = `${i + 1} / ${tests.length}`;
            startPerformance(tests[i].type, tests[i].size);
            if (i == tests.length -1) {
                generateReport = true;
            }
        }, tests[i].baseline);
    }
}

function onIPCBus_TestPerformanceStart(ipcBusEvent, msgTestStart) {
    var uuid = msgTestStart.uuid;
    let result = results.get(uuid);
    if (!result) {
        result = [msgTestStart];
        results.set(uuid, result);
    }
    else {
        result[0] = msgTestStart;
    }
    if (result.length > 1) {
        onIPCBus_AddTestPerformanceResult(result);
    }
}

function onIPCBus_TestPerformanceStop(ipcBusEvent, msgTestStop) {
    var uuid = msgTestStop.uuid;
    let result = results.get(uuid);
    if (!result) {
        result = [undefined, msgTestStop];
        results.set(uuid, result);
    }
    else {
        result.push(msgTestStop);
    }
    if (result[0]) {
        onIPCBus_AddTestPerformanceResult(result);
    }
}

function onIPCBus_AddTestPerformanceResult(results) {
    var msgTestStart = results[0];
    var msgTestStops = results.splice(1);
    for (let i = 0; i < msgTestStops.length; ++i) {
        var msgTestStop = msgTestStops[i];
        if (msgTestStart && msgTestStop) {
            const result = {
                start: msgTestStart,
                stop: msgTestStop,
                delay: msgTestStop.timeStamp - msgTestStart.timeStamp
            };
            delays.push(result);
            delays.sort((l, r) => l.delay - r.delay);
            onIPCBus_TestPerformanceResult(result);
        }
    }
}

function onIPCBus_TestPerformanceResult(result) {
    var msgTestStart = result.start;
    var msgTestStop = result.stop;
    if (msgTestStart && msgTestStop) {
        var table = document.getElementById('perfResults');
        var row = table.insertRow(-1);
        var cellType = row.insertCell(-1);
        var cellLink = row.insertCell(-1);
        var cell1 = row.insertCell(-1);
        var cell2 = row.insertCell(-1);
        var cell3 = row.insertCell(-1);
        cellType.innerHTML = `${msgTestStart.test.typeCommand} ${msgTestStart.test.typeArgs} (${msgTestStart.test.bufferSize})`;
        cellLink.innerHTML = `${msgTestStart.peer.process.type} => ${msgTestStop.peer.process.type}`;
        cell1.innerHTML = JSON.stringify(msgTestStart.peer);
        cell2.innerHTML = JSON.stringify(msgTestStop.peer);
        cell3.setAttribute('delay', result.delay);
        cell3.innerHTML = `${result.delay}`;

        var q = (delays.length / 5);
        var q1 = Math.floor(q);
        var q2 = Math.floor(q * 2);
        var q3 = Math.floor(q * 3);
        var q4 = Math.floor(q * 4);

        for (var i = 1; i < table.rows.length; ++i) {
            var curRow = table.rows[i];
            var delay = curRow.cells[3].getAttribute('delay');
            if (delay <= delays[q1].delay) {
                curRow.className = 'success';
                continue;
            }
            if (delay <= delays[q2].delay) {
                curRow.className = 'info';
                continue;
            }
            if (delay >= delays[q4].delay) {
                curRow.className = 'danger';
                continue;
            }
            if (delay >= delays[q3].delay) {
                curRow.className = 'warning';
                continue;
            }
            curRow.className = '';
        }

        clearTimeout(generateReportTimer);
        generateReportTimer = setTimeout(() => sendReportToMaster(), 2000);
    }
}

var processToMaster = new ProcessConnector('browser', ipcRenderer);

document.addEventListener('DOMContentLoaded', () => {
    var memSlide = document.querySelector(".memory-slide");
    var memVal = document.querySelector(".memory-value");
    if (memSlide && memVal) {
        memSlide.addEventListener("change", () => {
            memVal.value = memSlide.value;
        });
        memVal.addEventListener("change", () => {
            memSlide.value = memVal.value;
        });
    }
});

ipcBus.connect()
    .then(() => {
        console.log('renderer : connected to ipcBus');
        ipcBus.on('test-performance-start', onIPCBus_TestPerformanceStart);
        ipcBus.on('test-performance-stop', onIPCBus_TestPerformanceStop);
        perfTests.connect('view');
    });

