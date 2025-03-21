# Copyright 2024 The AutoVR Authors
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
"""
RPC protocol to communicate method instruction resolution and symbol resolution.

Used for better throughput and decrease memory usage on device.


-----------------
| Memory in VR  | is throttled (only 6GB RAM!). Subsidize memory throttling with rpc communication.
-----------------

"""

import json


class RPC:

    def set_export_async(self, exports):
        self.exports_async = exports

    def set_export_sync(self, exports):
        self.exports_sync = exports

    def init(self, symbol_payload: str = "", bypassSSLPinning: bool = False):
        """
        symbol payload format is a json string:
        {
           "methods": [
              {
                 "Name": "method name",
                 "Address": "0x12345",
                 "MethodAddress": "0x12345",
              },
              ...
           ]
        }
        """
        return self.exports_sync.init(symbol_payload, bypassSSLPinning)

    def check_health(self):
        return self.exports_async.check_health()

    # getInstructions RPC gets method instructions of given addresses.
    def get_instructions(self, addresses):
        return self.exports_sync.get_instructions(
            json.dumps({"methods": addresses}))

    def get_instructions_until_end(self, start):
        return self.exports_sync.get_instructions_until_end(
            json.dumps({"start": start}))

    def get_instructions_interval(self, start, end):
        return self.exports_sync.get_instructions_interval(
            json.dumps({
                "start": start,
                "end": end
            }))

    def get_methods_of_class_method(self, m_addr):
        return self.exports_sync.get_methods_of_class_method(m_addr)

    def get_return_type(self, addr):
        return self.exports_sync.get_return_type(addr)

    def count_all_scenes(self):
        return self.exports_sync.count_all_scenes()

    def resolve_symbols(self, symbols):
        return self.exports_sync.resolve_symbols(json.dumps(symbols))

    async def load_scene(self, scene_index):
        return await self.exports_async.load_scene(scene_index)

    def load_scene_events(self, scene_index, delay_scenes):
        return self.exports_sync.load_scene_events(scene_index, delay_scenes)

    async def trigger_event(self, event):
        return await self.exports_async.trigger_event(json.dumps(event))

    # events = a Map<string, string[]>. key = event addr, value = sequence of methods to execute.
    async def trigger_all_events(self, events):
        return await self.exports_async.trigger_all_events(json.dumps(events))

    def unload_scene(self, index):
        return self.exports_sync.unload_scene(index)

    def get_all_methods(self):
        return self.exports_sync.get_all_methods()
