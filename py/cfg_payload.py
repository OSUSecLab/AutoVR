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
