# shows the logs when WebCall server is running as systemd service
# tail -f /var/log/syslog |grep --line-buffered " webcall" |grep --line-buffered -vE "csp-report|_DeleteTweet" |cut -d ' ' --complement -f5-6
tail -8000 /var/log/syslog |grep --line-buffered " webcall" |cut -d ' ' --complement -f5-6
tail -f /var/log/syslog |grep --line-buffered " webcall"|cut -d ' ' --complement -f5-6

