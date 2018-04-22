// Copyright (c) 2018 Software.co Technologies, Inc. All Rights Reserved.
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {window, workspace, Disposable, ExtensionContext, TextDocument} from 'vscode';
import axios from 'axios';
import { SSL_OP_NO_SESSION_RESUMPTION_ON_RENEGOTIATION, EPROTONOSUPPORT } from 'constants';

const fs = require('fs');


// ? marks that the parameter is optional
type Project = {directory: String, name?: String};

const NO_NAME_FILE = 'Untitled';
const VERSION = '0.1.4';
const PM_URL = 'http://localhost:19234';
const DEFAULT_DURATION = 60;
const api = axios.create({
    baseURL: `${PM_URL}/api/v1/`
});

let wasMessageShown = false;

// Available to the KeystrokeCount and the KeystrokeCountController
let activeKeystrokeCountMap = {};

export function activate(ctx: ExtensionContext) {
    console.log(`Software.com: Loaded v${VERSION}`);

    //
    // Add the keystroke controller to the ext ctx, which
    // will then listen for text document changes
    //
    const controller = new KeystrokeCountController();
    ctx.subscriptions.push(controller);
}

function nowInSecs () {
    return Math.round(Date.now() / 1000);
}

//
// This will return the object in an object array
// based on a key and the key's value.
//
function findFileInfoInSource (source, filenameToMatch) {
    if (source[filenameToMatch] !== undefined && source[filenameToMatch] !== null) {
        return source[filenameToMatch]
    }
    return null;
}

export class KeystrokeCount {
    public source: {};
    public type: String;
    public data: Number
    public start: Number;
    public end: Number;
    public project: Project;
    public pluginId: Number;
    public version: String;

    constructor (project: Project) {
        const now = nowInSecs();

        this.source = {},
        this.type = 'Events',
        this.data = 0,
        this.start = now,
        this.end = now + DEFAULT_DURATION,
        this.project = project,
        this.pluginId = 2;
        this.version = VERSION;
    }

    hasData() {
        for (const fileName of Object.keys(this.source)) {
            const fileInfoData = this.source[fileName];
            // check if any of the metric values has data
            if (fileInfoData &&
                (fileInfoData.keys > 0 || fileInfoData.paste > 0 ||
                    fileInfoData.open > 0 || fileInfoData.close > 0 ||
                    fileInfoData.delete > 0)) {
                return true;
            }
        }
        return false;
    }

    postToPM() {
        const payload = JSON.parse(JSON.stringify(this));
        payload.data = String(payload.data);

        const projectName = (payload.project && payload.project.directory)
            ? payload.project.directory : 'null';
        
        // Null out the project if the project's name is 'null'
        if (projectName === 'null') {
            payload.project = null;
        }

        console.error(`Software.com: sending ${JSON.stringify(payload)}`);

        // POST the kpm to the PluginManager
        return api.post('/data', payload)
        .then((response) => {
            // everything is fine, remove this one from the map
            delete activeKeystrokeCountMap[projectName];
        })
        .catch(err => {
            if (!wasMessageShown) {
                window.showErrorMessage(
                    'We are having trouble sending data to Software.com. ' +
                    'Please make sure the Plugin Manager is running and logged on.', {
                        modal: true
                });
                console.error(`Software.com: Unable to send KPM information: ${err}`);
                wasMessageShown = true;
            }
            // remove this project from the map
            delete activeKeystrokeCountMap[projectName];
        });
    }
}

class KeystrokeCountController {

    private _activeDatas: {} = {};
    private _disposable: Disposable;
    private _sendDataInterval: any = null;

    constructor() {
        let subscriptions: Disposable[] = [];
        workspace.onDidOpenTextDocument(this._onOpenHandler, this);
        workspace.onDidCloseTextDocument(this._onCloseHandler, this);
        workspace.onDidChangeTextDocument(this._onEventHandler, this);
        this._disposable = Disposable.from(...subscriptions);

        // create the 60 second timer that will post keystroke
        // events to the pluing manager if there's any data to send
        this._sendDataInterval = setInterval(
            this.sendKeystrokeDataIntervalHandler, DEFAULT_DURATION * 1000);
    }

    private sendKeystrokeDataIntervalHandler() {
        //
        // Go through all keystroke count objects found in the map and send
        // the ones that have data (data is greater than 1), then clear the map
        //
        if (activeKeystrokeCountMap) {
            for (const key of Object.keys(activeKeystrokeCountMap)) {
                const keystrokeCount = activeKeystrokeCountMap[key];
                if (keystrokeCount.hasData()) {
                    // send the payload
                    setTimeout(() => keystrokeCount.postToPM(), 0);
                } else {
                    // remove it
                    delete activeKeystrokeCountMap[key];
                }
            }
        }
    }

    private getRootPath() {
        let rootPath = workspace.workspaceFolders
            && workspace.workspaceFolders[0]
            && workspace.workspaceFolders[0].uri
            && workspace.workspaceFolders[0].uri.fsPath;
        
        return rootPath;
    }

    private _onCloseHandler(event) {
        if (!this.isTrueEventFile(event)) {
            return;
        }
        const filename = event.fileName || NO_NAME_FILE;

        let [keystrokeCount, fileInfo, rootPath] = this.getFileInfoDatam(filename);

        this.updateFileInfoLength(filename, fileInfo);

        fileInfo.close = fileInfo.close + 1;
        console.log('Software.com: File closed: ' + filename);
    }

    private _onOpenHandler(event) {
        if (!this.isTrueEventFile(event)) {
            return;
        }
        const filename = event.fileName || NO_NAME_FILE;

        let [keystrokeCount, fileInfo, rootPath] = this.getFileInfoDatam(filename);

        this.updateFileInfoLength(filename, fileInfo);

        fileInfo.open = fileInfo.open + 1;
        console.log('Software.com: File opened: ' + filename);
    }

    /**
     * This will return true if it's a true file. we don't
     * want to send events for .git or other event triggers
     * such as extension.js.map events
     */
    private isTrueEventFile(event) {
        if (event && event.document) {
            if (event.document.isUntitled !== undefined
                    && event.document.isUntitled !== null
                    && event.document.isUntitled === true) {
                return false;
            }
            return true;
        }
        return false;
    }

    private updateFileInfoLength(filename, fileInfo) {
        if (filename !== NO_NAME_FILE) {
            fs.stat(filename, function(err, stats) {
                if (stats && stats["size"]) {
                    fileInfo.length = stats["size"];
                }
            });
        }
    }

    private _onEventHandler(event) {
        if (!this.isTrueEventFile(event)) {
            return;
        }

        let filename = event.document.fileName || NO_NAME_FILE;
        
        let [keystrokeCount, fileInfo, rootPath] = this.getFileInfoDatam(filename);

        this.updateFileInfoLength(filename, fileInfo);

        //
        // Map all of the contentChanges objets then use the
        // reduce function to add up all of the lengths from each
        // contentChanges.text.length value, but only if the text
        // has a length.
        //

        let newCount = event.contentChanges
                                .map(cc => (cc.text && cc.text.length > 0) ? cc.text.length : 0)
                                .reduce((prev, curr) => prev + curr, 0);

        // first check if there's a rangeLength, and if so it's character deletion
        if (newCount == 0 && event.contentChanges &&
                event.contentChanges.length > 0 &&
                event.contentChanges[0].rangeLength &&
                event.contentChanges[0].rangeLength > 0) {
            // since new count is zero, check the range length.
            // if there's range length then it's a deletion
            newCount = event.contentChanges[0].rangeLength / -1;
        }

        if (newCount === 0) {
            return;
        }

        if (newCount > 1) {
            //
            // it's a copy and past event
            //
            fileInfo.paste = fileInfo.paste + newCount;
            console.log('Software.com: Copy+Paste Incremented');
        } else if (newCount < 0) {
            fileInfo.delete = fileInfo.delete + Math.abs(newCount);
            console.log('Software.com: Delete Incremented');
        } else {
            // update the data for this fileInfo keys count
            fileInfo.keys = fileInfo.keys + 1;

            // update the overall count
            keystrokeCount.data = keystrokeCount.data + 1;
            console.log("Software.com: KPM incremented");
        }

        // update the map containing the keystroke count
        activeKeystrokeCountMap[rootPath] = keystrokeCount;
    }

    private getFileInfoDatam(filename) {
        //
        // get the root path
        //
        let rootPath = this.getRootPath();

        // the rootPath (directory) is used as the map key, must be a string
        rootPath = rootPath || 'None';
        let keystrokeCount = activeKeystrokeCountMap[rootPath];
        if (!keystrokeCount) {
            //
            // Create the keystroke count and add it to the map
            //
            keystrokeCount = new KeystrokeCount({
                // project.directory is used as an object key, must be string
                directory: rootPath,
                name: workspace.name || rootPath
            });
        }

        let fileInfo = null;
        if (filename) {
            //
            // Look for an existing file source. create it if it doesn't exist
            // or use it if it does and increment it's data value
            //
            fileInfo = findFileInfoInSource(keystrokeCount.source, filename);
            if (!fileInfo) {
                // initialize and add it
                fileInfo = {
                    keys: 0,
                    paste: 0,
                    open: 0,
                    close: 0,
                    delete: 0,
                    length: 0
                };
                keystrokeCount.source[filename] = fileInfo;
            }
        }

        return [keystrokeCount, fileInfo, rootPath];
    }

    public dispose() {
        clearInterval(this._sendDataInterval);
        this._disposable.dispose();
    }
}
