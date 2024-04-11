# TODO: change everything to _ case instead of snakeCase


# Static
def initEvent(parent, event):
    return EventNode(event, parent)


def initSceneNode(scene_index, initalEvents):
    startingNode = EventNode("scene:" + str(scene_index), None)
    for event in initalEvents:
        startingNode.addChild(initEvent(startingNode, event))
    return startingNode


class EventNode:

    def __init__(self, event_name, parent=None, all_visited=False):
        self.event_name = event_name
        self.parent = parent
        self.all_visited = all_visited
        self.triggered = False
        self.children = []

    def addChild(self, event_node):
        self.children.append(event_node)
        self.all_visited = self.all_visited and event_node.all_visited

    # Ensure all child nodes are loaded
    def markTriggered(self):
        self.triggered = True

    def updateVisited(self):
        self.all_visited = all([child.all_visited for child in self.children])

    def __hash__(self):
        return hash(self.event_name + str(self.all_visited))

    def __eq__(self, other):
        return self.__hash__() == other.__hash__()

    def to_string(self):
        return self.event_name


# Init scene => creates scene starting node
#            => gather first events
#            => add first events as children to the scene event
#            => trigger the first event, mark its EventNode as triggered
#            => get next events from trigger, create EventNodes for each
#            => add childs branching from triggered event.
#            => repeat
class EventGraph:

    def __init__(self, scene_index, initalEvents):
        self.scene_map = {}

        # The 'scene_node' aka the root node
        self.scene_node = initSceneNode(scene_index, initalEvents)
        self.addCompletedEventNode(self.scene_node)

    # Ensure event_node has all children loaded before calling
    def addCompletedEventNode(self, event_node):
        self.scene_map[event_node] = event_node.children

    def findNextPath(self, start, path=[]):
        if start.all_visited:
            return None
        path = path + [start]
        if len(start.children) == 0:
            return path
        if start not in self.scene_map:
            return None
        for node in self.scene_map[start]:
            if node not in path:
                newpath = self.findNextPath(node, path)
                if newpath and node in newpath:
                    return newpath
        return None
