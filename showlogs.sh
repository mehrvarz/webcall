#slogall |grep " rtcsig"
#echo "(tail)"
#slogtail |grep " rtcsig"
tail -8000 /var/log/syslog |grep " rtcsig"
tail -f /var/log/syslog |grep " rtcsig"

