# ZOS

## The Kernel

This is the core kernel that runs the OS, this should remain completely self contained, with no references outside this folder.

A few things, such as Logger, have a 'forwarding' file in /lib/Logger.js that loads this, this maintains the userspace/kernelspace boundaries