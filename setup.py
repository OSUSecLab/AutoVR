from setuptools import find_packages, setup

from autovr import __version__

setup(
    name='autovr',
    version=__version__,

    url='https://github.com/OSUSecLab/AutoVR',
    author='OSUSecLab',
    package_dir = {'autovr': 'autovr'},
)
