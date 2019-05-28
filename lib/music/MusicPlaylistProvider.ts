import {
    TreeDataProvider,
    TreeItem,
    TreeItemCollapsibleState,
    Command,
    EventEmitter,
    Event,
    Disposable,
    TreeView
} from "vscode";
import * as path from "path";
import { MusicStoreManager } from "./MusicStoreManager";
import { PlaylistItem, play, PlayerName } from "cody-music";

const createPlaylistTreeItem = (
    p: PlaylistItem,
    cstate: TreeItemCollapsibleState
) => {
    return new PlaylistTreeItem(p, cstate);
};

const musicstoreMgr = MusicStoreManager.getInstance();

export const connectPlaylistTreeView = (view: TreeView<PlaylistItem>) => {
    return Disposable.from(
        view.onDidChangeSelection(e => {
            if (
                e.selection &&
                e.selection.length === 1 &&
                e.selection[0].type === "track"
            ) {
                // play the track
                let uri = e.selection[0].id;
                // play(PlayerName.SpotifyWeb, { track_ids: [uri] });
            }
        }),
        view.onDidChangeVisibility(e => {
            if (e.visible) {
                //
            }
        })
    );
};

export class MusicPlaylistProvider implements TreeDataProvider<PlaylistItem> {
    private _onDidChangeTreeData: EventEmitter<
        PlaylistItem | undefined
    > = new EventEmitter<PlaylistItem | undefined>();
    readonly onDidChangeTreeData: Event<PlaylistItem | undefined> = this
        ._onDidChangeTreeData.event;

    constructor() {
        //
    }

    getParent(_p: PlaylistItem) {
        return void 0; // all playlists are in root
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    play(): void {
        console.log("play");
    }

    pause(): void {
        console.log("pause");
    }

    getTreeItem(p: PlaylistItem): PlaylistTreeItem {
        if (p.type === "playlist") {
            // it's a track parent (playlist)
            if (p && p.tracks && p.tracks["total"] && p.tracks["total"] > 0) {
                if (!musicstoreMgr.hasTracksForPlaylistId(p.id)) {
                    musicstoreMgr.getTracksForPlaylistId(p.id);
                }
                return createPlaylistTreeItem(
                    p,
                    TreeItemCollapsibleState.Collapsed
                );
            }
            return createPlaylistTreeItem(p, TreeItemCollapsibleState.None);
        } else {
            // it's a track
            return createPlaylistTreeItem(p, TreeItemCollapsibleState.None);
        }
    }

    async getChildren(element?: PlaylistItem): Promise<PlaylistItem[]> {
        if (element) {
            // return track of the playlist parent
            let tracks = musicstoreMgr.getTracksForPlaylistId(element.id);
            return tracks;
        } else {
            // get the top level playlist parents
            let playlists = musicstoreMgr.runningPlaylists;
            return playlists;
        }
    }
}

class PlaylistTreeItem extends TreeItem {
    constructor(
        private readonly musicTreeItem: PlaylistItem,
        public readonly collapsibleState: TreeItemCollapsibleState,
        public readonly command?: Command
    ) {
        super(musicTreeItem.name, collapsibleState);
    }

    get tooltip(): string {
        return `${this.musicTreeItem.id}`;
    }

    iconPath = {
        light: path.join(
            __filename,
            "..",
            "..",
            "resources",
            "light",
            "paw.svg"
        ),
        dark: path.join(__filename, "..", "..", "resources", "dark", "paw.svg")
    };

    contextValue = "musicTreeItem";
}
