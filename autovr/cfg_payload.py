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
class PayloadBuilder(object):

    def __init__(self, resolved):
        self.data = {}

    def add_mi(addr, resolved):
        if mi.contains_target:
            self.data[addr] = mi.to_json()
            for branch in mi.branches:
                if branch in resolved:
                    b_mi = resolved[branch]
                    if b_mi.contains_target:
                        self.add_mi(branch, resolved)
