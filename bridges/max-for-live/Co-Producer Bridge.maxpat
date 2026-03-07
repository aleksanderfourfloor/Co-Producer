{
  "patcher": {
    "fileversion": 1,
    "appversion": {
      "major": 8,
      "minor": 6,
      "revision": 5,
      "architecture": "x64",
      "modernui": 1
    },
    "classnamespace": "box",
    "rect": [34.0, 87.0, 900.0, 520.0],
    "bglocked": 0,
    "openinpresentation": 1,
    "default_fontsize": 12.0,
    "default_fontface": 0,
    "default_fontname": "Arial",
    "gridonopen": 1,
    "gridsize": [15.0, 15.0],
    "toolbarvisible": 1,
    "boxes": [
      {
        "box": {
          "id": "obj-1",
          "maxclass": "comment",
          "linecount": 2,
          "text": "Co-Producer Bridge\\nDrop this device on any MIDI track while the desktop app is running.",
          "patching_rect": [20.0, 20.0, 360.0, 34.0],
          "presentation": 1,
          "presentation_rect": [18.0, 18.0, 360.0, 34.0]
        }
      },
      {
        "box": {
          "id": "obj-2",
          "maxclass": "comment",
          "linecount": 2,
          "text": "The bridge connects automatically. Keep this device in the same folder as bridge-node.mjs and live-observer.js.",
          "patching_rect": [20.0, 58.0, 520.0, 34.0],
          "presentation": 1,
          "presentation_rect": [18.0, 56.0, 520.0, 34.0]
        }
      },
      {
        "box": {
          "id": "obj-3",
          "maxclass": "newobj",
          "text": "node.script bridge-node.mjs @autostart 1 @defer 1",
          "patching_rect": [20.0, 130.0, 160.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-10",
          "maxclass": "newobj",
          "text": "deferlow",
          "patching_rect": [190.0, 130.0, 58.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-4",
          "maxclass": "newobj",
          "text": "js live-observer.js",
          "patching_rect": [230.0, 130.0, 110.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-5",
          "maxclass": "newobj",
          "text": "live.thisdevice",
          "patching_rect": [20.0, 170.0, 88.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-6",
          "maxclass": "message",
          "text": "connect",
          "patching_rect": [120.0, 170.0, 50.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-7",
          "maxclass": "comment",
          "text": "Manual debug buttons below are optional.",
          "patching_rect": [20.0, 215.0, 220.0, 20.0]
        }
      },
      {
        "box": {
          "id": "obj-8",
          "maxclass": "message",
          "text": "snapshot_request",
          "patching_rect": [20.0, 245.0, 95.0, 22.0]
        }
      },
      {
        "box": {
          "id": "obj-9",
          "maxclass": "message",
          "text": "analysis_request {\\\"id\\\":\\\"manual\\\",\\\"target\\\":\\\"selection\\\"}",
          "patching_rect": [130.0, 245.0, 245.0, 22.0]
        }
      }
    ],
    "lines": [
      {
        "patchline": {
          "source": ["obj-3", 0],
          "destination": ["obj-10", 0]
        }
      },
      {
        "patchline": {
          "source": ["obj-10", 0],
          "destination": ["obj-4", 0]
        }
      },
      {
        "patchline": {
          "source": ["obj-4", 0],
          "destination": ["obj-3", 0]
        }
      },
      {
        "patchline": {
          "source": ["obj-5", 0],
          "destination": ["obj-6", 0]
        }
      },
      {
        "patchline": {
          "source": ["obj-6", 0],
          "destination": ["obj-3", 0]
        }
      },
      {
        "patchline": {
          "source": ["obj-8", 0],
          "destination": ["obj-4", 0]
        }
      },
      {
        "patchline": {
          "source": ["obj-9", 0],
          "destination": ["obj-4", 0]
        }
      }
    ]
  }
}
