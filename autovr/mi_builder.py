"""
Method Instructions builder
Method instructions take long to build,
function resolution will have enormous branches on VR
computing time will need to be on the host machine majority memory overhead will be used on host machine via RPC
"""

import json
import threading

res_symbols = {}
_resolved = dict()
_resolving = set()
branch_blacklist = [
    "memcpy", "memset", "Object", "IntPtr", "StringBuilder", "String", "Number"
]

curr = ""
branch_count = 0


class Instruction:

    def __init__(self, instruction_meta):
        ins = instruction_meta
        self.instruction = ins["instruction"]
        self.groups = ins["groups"]
        self.mnemonic = ins["mnemonic"]
        self.addr = ins["addr"]

    def to_string(self):
        return self.instruction
    
    def __repr__(self) -> str:
        return self.to_string()
    
    def __str__(self) -> str:
        return self.to_string()


class InstructionFeeder:
    __instance = None
    _rpc = None
    _resolved = dict()

    @staticmethod
    def get_instance():
        if InstructionFeeder.__instance is None:
            InstructionFeeder()
        return InstructionFeeder.__instance

    def __init__(self):
        if InstructionFeeder.__instance is not None:
            raise Exception(
                "InstructionFeeder class, use get_instance() instead.")
        else:
            InstructionFeeder.__instance = self

    def add_rpc(self, rpc):
        self._rpc = rpc

    def get_ins_full(self, start):
        if start in self._resolved:
            return self._resolved[start]
        instructions = json.loads(self._rpc.get_instructions([start]))
        for addr, inst in instructions.items():
            ins = inst["instructions"]
            self._resolved[start] = ins.copy()
            return ins
        return []

    def get_ins_until_end(self, start):
        return self.get_ins_full(start)

    def get_ins(self, start, end):
        if int(start, 16) > int(end, 16):
            print(start)
            print(end)
            raise Exception("start addr is greater than end addr, impossible.")
        loads = json.loads(self._rpc.get_instructions_interval(start, end))
        instructions = []
        for ins_str in loads[start]["instructions"]:
            instructions.append(Instruction(ins_str))
        return instructions

    # Give it and address to a method =>
    # il2cpp find class of method =>
    # get all methods of that class.
    def get_methods_of_class_method(self, m_addr):
        return self._rpc.get_methods_of_class_method(m_addr)


class CFGNode:

    def __init__(
            self,
            rpc,
            _methods,
            _blacklist,
            m_addr='',
            regsTable={
                'x0': 'this',
                'x1': 'param2',
                'x2': 'param3',
                'x3': 'param4',
                'x4': 'param5',
                'x5': 'param6',
                'x6': 'param7',
                'x7': 'param8',
                'x8': '',
                'x9': '',
                'x10': '',
                'x11': '',
                'x12': '',
                'x13': '',
                'x14': '',
                'x15': '',
                'x16': '',
                'x17': '',
                'x18': '',
                'x19': '',
                'x20': '',
                'x21': '',
                'x22': '',
                'x23': '',
                'x24': '',
                'x25': '',
                'x26': '',
                'x27': '',
                'x28': '',
                'x29': '',
                'x30': '',
            },
            adrp_regs={},
            co_reg='x0',
            shallow=False):
        self.rpc = rpc
        self.regsTable = regsTable.copy()
        self.adrp_regs = adrp_regs.copy()
        self.co_reg = co_reg
        self._methods = _methods
        self._blacklist = _blacklist
        self.is_blacklist = False
        self.m_addr = m_addr
        self.t_branch = None
        self.f_branch = None
        self.shallow = shallow
        self.branches = {}
        self.reads = set()
        self.writes = set()
        self.deps = []
        self.branch_count = 1

    def start(self, start, end):
        ins_feeder = InstructionFeeder.get_instance()
        self.end_addr = end
        for ins in ins_feeder.get_ins(start, end):
            can_cont = self.add_ins(ins)
            if not can_cont:
                break

    def copy(self, node):
        self.rpc = node.rpc
        self.regsTable = node.regsTable.copy()
        self.adrp_regs = node.adrp_regs.copy()
        self.co_reg = node.co_reg
        self._methods = node._methods
        self._blacklist = node._blacklist
        self.is_blacklist = node.is_blacklist
        self.t_branch = node.t_branch
        self.f_branch = node.f_branch
        self.shallow = node.shallow
        self.branches = node.branches
        self.reads = node.reads.copy()
        self.writes = node.writes.copy()
        self.deps = node.deps

    def start_until_end(self, start):
        ins_feeder = InstructionFeeder.get_instance()
        if start in self._methods:
            #print("STARTING", self._methods[start])
            self.m_addr = self._methods[start]
            if "System.Collections" in self._methods[start]:
                return
        if start not in _resolved and start not in _resolving:
            _resolving.add(start)
        elif start in _resolved:
            self.copy(_resolved[start])
            return
        else:
            return

        instructions = ins_feeder.get_ins_until_end(start)
        for ins in instructions:
            can_cont = self.add_ins(Instruction(ins))
            if not can_cont:
                break

        if start not in _resolved and start in _resolving:
            _resolved[start] = self
            _resolving.remove(start)

    def add_ins(self, ins: Instruction):
        if "branch_relative" in ins.groups:
            return self._resolve_branch(ins)
        else:
            return self.resolve_ins(ins)

    def _resolve_branch(self, ins: Instruction):
        m = ins.mnemonic
        if m.startswith("cb") or m.startswith("tb") or m.startswith(
                "bl") or m == 'b':
            return self.resolve_branch(ins)
        return False

    def resolve_ins(self, ins: Instruction):
        typeOf = ins.mnemonic
        if 'mov' in typeOf:
            self.resolve_mov(ins)
        elif 'ldr' in typeOf:
            self.resolve_ldr(ins)
        elif 'str' in typeOf:
            self.resolve_str(ins)
        elif 'adrp' in typeOf:
            self.resolve_adrp(ins)
        return True

    def resolve_adrp(self, ins: Instruction):
        modif_ins = ins.to_string().replace(',', '').split(' ')

        # i = 0, adrp
        # i = 1, register
        # i = 2, offset

        reg = modif_ins[1]
        offset = modif_ins[2].replace(']', '').replace('#', '')
        self.adrp_regs[self._key_of(reg)] = hex(int(offset, 16))

    # ldr x0 [x1, #0x30]
    def resolve_ldr(self, ins: Instruction):
        modif_ins = ins.to_string().replace(',', '').split(' ')
        size = len(modif_ins)
        dst = modif_ins[1]
        src = modif_ins[2].replace('[', '').replace(']', '')
        offset = ''

        if self._key_of(dst) == self.co_reg and size > 3:
            offset = modif_ins[3].replace(']',
                                          '').replace('#',
                                                      '').replace('!', '')
            self.reads.add(offset)
        if self._key_of(src) in self.regsTable:
            self.regsTable[self._key_of(dst)] = self.regsTable[self._key_of(
                src)]
            if len(offset) > 0:
                self.regsTable[self._key_of(dst)] += '+' + offset

        if self._key_of(src) in self.adrp_regs:
            if size > 3:
                if offset.startswith('0x'):
                    page = self.adrp_regs[self._key_of(src)]
                    address = str(hex(int(page, 16) + int(offset, 16)))
                    if address not in res_symbols:
                        # Symbol resolution rpc
                        m_addr = json.loads(self.rpc.resolve_symbols(
                            [address]))[address]
                        res_symbols[address] = m_addr
                        if m_addr != '0x0':
                            self.add_branch(ins.addr, m_addr)
                else:
                    page = self.adrp_regs[self._key_of(src)]
                    address = str(hex(int(page, 16)))
                    if address not in res_symbols:
                        m_addr = json.loads(self.rpc.resolve_symbols(
                            [address]))[address]
                        res_symbols[address] = m_addr
                        if m_addr != '0x0':
                            self.add_branch(ins.addr, m_addr)

    # 0   1  2    3
    # str x0 [x1, #0x30]
    def resolve_str(self, ins: Instruction):
        modif_ins = ins.to_string().replace(',', '').split(' ')

        size = len(modif_ins)

        src = modif_ins[1]
        dst = modif_ins[2].replace('[', '')
        if size > 3:
            offset = modif_ins[3].replace(']',
                                          '').replace('#',
                                                      '').replace('!', '')
            if (self._key_of(dst)) == self.co_reg and size > 3:
                self.writes.add(offset)

    # 0   1   2
    # mov x0, x1
    # mov x0, #0x100000
    def resolve_mov(self, ins):
        modif_ins = ins.to_string().replace(',', '').split(' ')
        dst = modif_ins[1]
        src = modif_ins[2]

        if self.is_in_table(dst):
            if self.is_in_table(src):
                self.regsTable[self._key_of(dst)] = self.regsTable[
                    self._key_of(src)]
            elif "#0x" in src:
                self.regsTable[self._key_of(dst)] = src[1:]

    # This means we need to find reads and writes to this
    # CLASS + 0x14
    def resolve_dep(self, reg):
        method_addrs = []
        val = self.regsTable[self._key_of(reg)]
        #print(self.regsTable)
        if 'function|' in val:
            info = val.split('|')
            m_addr = info[1]

            if m_addr in self.branches:
                print("CHECKING: ", self._methods[m_addr])
                reads = self.branches[m_addr].reads

                # find methods that write CLASS + 0x14
                m_writes = self.shallow_resolve(m_addr)
                for m, writes in m_writes.items():
                    for write in writes:
                        if write in reads:
                            method_addrs.append(m)
        return method_addrs

    def resolve_reads_deps(self):
        print(self.reads)
        for reads in self.reads:
            m_writes = self.shallow_resolve(self.m_addr)
            for m, writes in m_writes.items():
                for write in writes:
                    if write in reads:
                        self.deps.append(m)

    # shallow resolve all methods of CLASS
    def shallow_resolve(self, m_addr):
        ins_feeder = InstructionFeeder.get_instance()
        m_addrs = ins_feeder.get_methods_of_class_method(m_addr)
        m_writes = {}
        for addr in m_addrs:
            node = CFGNode(self.rpc,
                           self._methods,
                           self._blacklist,
                           shallow=True)
            node.start_until_end(addr)
            self.branch_count = self.branch_count + node.branch_count
            m_writes[addr] = node.writes.copy()
        return m_writes

    # bl 0x888888
    # 0    1   2
    # cnbz x0, 0x88888
    # cbz x0, 0x88888
    # 0    1   2     3
    # tnbz x0, 0x00, 0x88888
    # tbz x0, 0x000, 0x88888
    def resolve_branch(self, ins):
        modif_ins = ins.to_string().replace(',', '').split(' ')

        # size 2 => bl
        # size 3 => cnbz/cbz
        # size 4 => tnbz/tbz
        size = len(modif_ins)

        if size == 2:
            jmp = modif_ins[1].replace('#', '')
            if jmp in self._blacklist:
                self.is_blacklist = True
                print(jmp)
            elif jmp in self._methods and not self.shallow:
                name = self._methods[jmp]
                for b in branch_blacklist:
                    if b in name:
                        return True

                node = CFGNode(self.rpc,
                               self._methods,
                               self._blacklist,
                               regsTable=self.regsTable,
                               shallow=True)
                node.start_until_end(jmp)
                self.branch_count = self.branch_count + node.branch_count
                self.add_branch(jmp, node)
                # TODO: adjust method for methods that have multiple params to calls
                # ReturnType|PassedInType or value|0x8888 -> address of dependent function
                self.regsTable["x0"] = f"function|{jmp}"
            elif jmp in self._methods:
                self.regsTable["x0"] = f"function|{jmp}"
            return True

        addr = modif_ins[2].replace('#', '')
        if size == 4:
            addr = modif_ins[3].replace('#', '')

        t_addr = hex(int(ins.addr, 16) + 4)
        f_addr = addr

        reg = self._key_of(modif_ins[1])
        self.deps += self.resolve_dep(reg)

        # Avoid jump backs like in while loops
        if int(f_addr, 16) > int(ins.addr, 16):
            self.f_branch = self._create_branch(f_addr)

        if int(t_addr, 16) <= int(f_addr, 16):
            self.t_branch = self._create_branch(t_addr, f_addr)

        if self.t_branch:
            self._update_branch_stats(self.t_branch)

        if self.f_branch:
            self._update_branch_stats(self.f_branch)

        return False

    def _create_branch(self, target_addr, end_addr=None):
        branch = CFGNode(self.rpc,
                         self._methods,
                         self._blacklist,
                         m_addr=self.m_addr,
                         regsTable=self.regsTable,
                         adrp_regs=self.adrp_regs,
                         co_reg=self.co_reg,
                         shallow=self.shallow)
        self.branch_count = self.branch_count + branch.branch_count
        if end_addr is None:
            branch.start_until_end(target_addr)
        elif target_addr:
            branch.start(target_addr, end_addr)
        if branch.is_blacklist:
            return None
        return branch

    def _update_branch_stats(self, branch):
        self.writes.update(branch.writes)
        self.reads.update(branch.reads)
        self.deps += branch.deps

    def add_branch(self, addr, branch):
        self.branches[addr] = branch

    def is_in_table(self, reg):
        return self._key_of(reg) in self.regsTable

    def return_type(self, addr):
        return self.rpc.get_return_type(addr)

    def _key_of(self, reg):
        return 'x' + reg[1:]
