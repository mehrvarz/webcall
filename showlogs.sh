# shows the logs when WebCall server is running as systemd service
tail -8000 /var/log/syslog |grep " webcall"
tail -f /var/log/syslog |grep " webcall"

